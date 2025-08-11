from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Caminhos base
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"

app = FastAPI(title="LAMDEC Desafio API", version="1.0.0")

# Habilita CORS para o servidor de frontend em desenvolvimento
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------- Auxiliares ----------------------------- #

RESUMO_MAP: Dict[str, str] = {
    "inscricoes": "inscricoes.json",
    "inscricoes_canceladas": "inscricoes_canceladas.json",
    "inscricoes_quitadas": "inscricoes_quitadas.json",
    "montante_acumulado": "montante_acumulado.json",
    "quantidade_cdas": "quantidade_cdas.json",
    "saldo_cdas": "saldo_cdas.json",
    "distribuicao_cdas": "distribuicao_cdas.json",
}

CDA_FILENAME = "cdas.json"

SITUACAO_CODE_TO_LABEL: Dict[int, str] = {
    -1: "Cancelada",
    0: "Em cobrança",
    1: "Quitada",
}

SITUACAO_LABEL_TO_CODE: Dict[str, int] = {
    label.lower(): code for code, label in SITUACAO_CODE_TO_LABEL.items()
}


@lru_cache(maxsize=None)
def read_json_file(file_name: str) -> Any:
    file_path = DATA_DIR / file_name
    if not file_path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")
    with file_path.open("r", encoding="utf-8") as f:
        return json.load(f)

@lru_cache(maxsize=None)
def get_cda_items() -> List["CDAItem"]:
    """Carrega e mantém em cache os itens de CDA como modelos validados."""
    raw = read_json_file(CDA_FILENAME)
    return [CDAItem(**row) for row in raw]

@lru_cache(maxsize=None)
def get_cda_indexes() -> Dict[str, Any]:
    """Constrói índices simples em memória para acelerar a filtragem.

    Retorna um dicionário com:
      - natureza_to_indices: Dict[str, Set[int]]
      - situacao_to_indices: Dict[int, Set[int]]
    """
    items = get_cda_items()
    natureza_to_indices: Dict[str, set] = {}
    situacao_to_indices: Dict[int, set] = {}
    for idx, it in enumerate(items):
        natureza_to_indices.setdefault(it.natureza, set()).add(idx)
        situacao_to_indices.setdefault(it.agrupamento_situacao, set()).add(idx)
    return {
        "natureza_to_indices": natureza_to_indices,
        "situacao_to_indices": situacao_to_indices,
    }

# ----------------------------- Modelos ----------------------------- #

class CDAItem(BaseModel):
    numCDA: str
    score: float
    valor_saldo_atualizado: float
    qtde_anos_idade_cda: int
    agrupamento_situacao: int
    natureza: str

    @property
    def situacao_label(self) -> str:
        return SITUACAO_CODE_TO_LABEL.get(self.agrupamento_situacao, "Desconhecida")


class CDASearchResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[CDAItem]


SortField = Literal["saldo", "ano", "score"]
SortDir = Literal["asc", "desc"]


# ----------------------------- Rotas ----------------------------- #

@app.get("/resumo/{nome}")
def get_resumo(nome: str) -> Any:
    """Retorna o conteúdo bruto de um arquivo de resumo JSON.

    Nomes aceitos: inscricoes, inscricoes_canceladas, inscricoes_quitadas,
    montante_acumulado, quantidade_cdas, saldo_cdas, distribuicao_cdas.
    """
    if nome not in RESUMO_MAP:
        raise HTTPException(status_code=404, detail="Resumo não encontrado")
    try:
        return read_json_file(RESUMO_MAP[nome])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Arquivo de resumo não encontrado")


@app.get("/cda/search", response_model=CDASearchResponse)
def search_cdas(
    q: Optional[str] = Query(None, description="Busca por substring do número da CDA"),
    natureza: Optional[List[str]] = Query(None, description="Filtrar por natureza (multi)"),
    natureza_brackets: Optional[List[str]] = Query(None, alias="natureza[]"),
    situacao: Optional[List[str]] = Query(
        None,
        description="Filtrar por situação: valores aceitos -1,0,1 ou Cancelada,Em cobrança,Quitada",
    ),
    situacao_brackets: Optional[List[str]] = Query(None, alias="situacao[]"),
    min_ano: Optional[int] = Query(None, ge=0, description="Idade mínima da CDA em anos"),
    max_ano: Optional[int] = Query(None, ge=0, description="Idade máxima da CDA em anos"),
    min_saldo: Optional[float] = Query(None, ge=0, description="Saldo mínimo"),
    max_saldo: Optional[float] = Query(None, ge=0, description="Saldo máximo"),
    min_score: Optional[float] = Query(None, ge=0, le=1, description="Score mínimo (0-1)"),
    max_score: Optional[float] = Query(None, ge=0, le=1, description="Score máximo (0-1)"),
    sort_by: SortField = Query("saldo"),
    sort_dir: SortDir = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> CDASearchResponse:
    """Busca e filtra registros do arquivo cdas.json com paginação e ordenação."""
    try:
        items: List[CDAItem] = get_cda_items()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Arquivo de CDAs não encontrado")

    indexes = get_cda_indexes()

    # Suporta serialização de arrays do axios com colchetes
    if natureza is None and natureza_brackets is not None:
        natureza = natureza_brackets
    if situacao is None and situacao_brackets is not None:
        situacao = situacao_brackets

    # Filtragem
    def normalize_situacao_values(values: List[str]) -> List[int]:
        normalized: List[int] = []
        for v in values:
            if v is None:
                continue
            v = str(v).strip()
            # tenta código numérico primeiro
            try:
                normalized.append(int(v))
                continue
            except ValueError:
                pass
            # tenta mapeamento por rótulo
            code = SITUACAO_LABEL_TO_CODE.get(v.lower())
            if code is not None:
                normalized.append(code)
        return normalized

    allowed_situacoes: Optional[List[int]] = None
    if situacao:
        allowed_situacoes = normalize_situacao_values(situacao)
        if not allowed_situacoes:
            # se o usuário informou um rótulo inválido, nada corresponde
            return CDASearchResponse(total=0, page=page, page_size=page_size, items=[])

    # Semeia índices candidatos a partir dos índices para reduzir a varredura
    candidate_indices: Optional[set] = None
    if natureza:
        natureza_set = set()
        for n in set(natureza):
            natureza_set |= indexes["natureza_to_indices"].get(n, set())
        candidate_indices = natureza_set
    if allowed_situacoes is not None:
        situ_set = set()
        for s in set(allowed_situacoes):
            situ_set |= indexes["situacao_to_indices"].get(s, set())
        candidate_indices = situ_set if candidate_indices is None else (candidate_indices & situ_set)
    if candidate_indices is None:
        candidate_indices = set(range(len(items)))

    # Aplica filtros restantes no conjunto candidato reduzido
    filtered_items: List[CDAItem] = []
    for idx in candidate_indices:
        x = items[idx]
        if q and q not in x.numCDA:
            continue
        if min_ano is not None and x.qtde_anos_idade_cda < min_ano:
            continue
        if max_ano is not None and x.qtde_anos_idade_cda > max_ano:
            continue
        if min_saldo is not None and x.valor_saldo_atualizado < min_saldo:
            continue
        if max_saldo is not None and x.valor_saldo_atualizado > max_saldo:
            continue
        if min_score is not None and x.score < min_score:
            continue
        if max_score is not None and x.score > max_score:
            continue
        filtered_items.append(x)

    # Ordenação
    reverse = sort_dir == "desc"

    if sort_by == "saldo":
        key_fn = lambda x: x.valor_saldo_atualizado
    elif sort_by == "ano":
        key_fn = lambda x: x.qtde_anos_idade_cda
    else:
        key_fn = lambda x: x.score

    filtered_items.sort(key=key_fn, reverse=reverse)

    # Paginação
    total = len(filtered_items)
    start = (page - 1) * page_size
    end = start + page_size
    paged = filtered_items[start:end]

    return CDASearchResponse(total=total, page=page, page_size=page_size, items=paged)


@app.get("/")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/kpis/volume_em_cobranca")
def kpi_volume_em_cobranca() -> Dict[str, int]:
    """Conta todos os registros com agrupamento_situacao == 0 em cdas.json.

    Esse valor corresponde ao Volume de CDAs em cobrança (contagem bruta),
    independente de natureza ou outros atributos.
    """
    try:
        raw_data = read_json_file(CDA_FILENAME)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Arquivo de CDAs não encontrado")

    try:
        total = 0
        for row in raw_data:
            try:
                if int(row.get("agrupamento_situacao", 99)) == 0:
                    total += 1
            except Exception:
                # ignora linhas malformadas
                pass
        return {"total": total}
    except Exception:
        raise HTTPException(status_code=500, detail="Falha ao calcular KPI") 