from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Base paths
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR

app = FastAPI(title="LAMDEC Desafio API", version="1.0.0")

# Enable CORS for the frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------- Helpers ----------------------------- #

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


# ----------------------------- Models ----------------------------- #

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


# ----------------------------- Endpoints ----------------------------- #

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
        raw_data = read_json_file(CDA_FILENAME)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Arquivo de CDAs não encontrado")

    # Transform into objects to leverage validation
    items: List[CDAItem] = [CDAItem(**row) for row in raw_data]

    # Support axios array serialization with brackets
    if natureza is None and natureza_brackets is not None:
        natureza = natureza_brackets
    if situacao is None and situacao_brackets is not None:
        situacao = situacao_brackets

    # Filtering
    def normalize_situacao_values(values: List[str]) -> List[int]:
        normalized: List[int] = []
        for v in values:
            if v is None:
                continue
            v = str(v).strip()
            # try numeric code first
            try:
                normalized.append(int(v))
                continue
            except ValueError:
                pass
            # try label mapping
            code = SITUACAO_LABEL_TO_CODE.get(v.lower())
            if code is not None:
                normalized.append(code)
        return normalized

    allowed_situacoes: Optional[List[int]] = None
    if situacao:
        allowed_situacoes = normalize_situacao_values(situacao)
        if not allowed_situacoes:
            # if user passed an invalid label, nothing matches
            return CDASearchResponse(total=0, page=page, page_size=page_size, items=[])

    def predicate(x: CDAItem) -> bool:
        if q and q not in x.numCDA:
            return False
        if natureza:
            if x.natureza not in set(natureza):
                return False
        if allowed_situacoes is not None and x.agrupamento_situacao not in allowed_situacoes:
            return False
        if min_ano is not None and x.qtde_anos_idade_cda < min_ano:
            return False
        if max_ano is not None and x.qtde_anos_idade_cda > max_ano:
            return False
        if min_saldo is not None and x.valor_saldo_atualizado < min_saldo:
            return False
        if max_saldo is not None and x.valor_saldo_atualizado > max_saldo:
            return False
        if min_score is not None and x.score < min_score:
            return False
        if max_score is not None and x.score > max_score:
            return False
        return True

    filtered = list(filter(predicate, items))

    # Sorting
    reverse = sort_dir == "desc"

    if sort_by == "saldo":
        key_fn = lambda x: x.valor_saldo_atualizado
    elif sort_by == "ano":
        key_fn = lambda x: x.qtde_anos_idade_cda
    else:
        key_fn = lambda x: x.score

    filtered.sort(key=key_fn, reverse=reverse)

    # Pagination
    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    paged = filtered[start:end]

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