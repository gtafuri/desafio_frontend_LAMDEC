# Dashboard LAMDEC

## Pré-requisitos
- Python 3.10+
- Node.js 18+

## Estrutura
```
raiz/
  backend/
  frontend/
  data/                 # todos os arquivos .json ficam aqui
```

## Backend (FastAPI)
1) Criar e ativar o ambiente virtual
- Windows (PowerShell):
  - cd backend
  - python -m venv .venv
  - .\.venv\Scripts\activate
- macOS/Linux:
  - cd backend
  - python3 -m venv .venv
  - source .venv/bin/activate

2) Instalar dependências
- pip install -r requirements.txt

3) Executar a API
- uvicorn main:app --host 127.0.0.1 --port 8000 --reload


### Endpoints principais
- GET /                       → health check
- GET /resumo/{nome}          → dados brutos (inscricoes, inscricoes_canceladas, inscricoes_quitadas, montante_acumulado, quantidade_cdas, saldo_cdas, distribuicao_cdas)
- GET /cda/search             → busca/filtragem/paginação de CDAs
  - Parâmetros: q, natureza (multi), situacao (multi: -1,0,1 ou rótulos), min/max_ano, min/max_saldo, min/max_score, sort_by, sort_dir, page, page_size
  - Suporta tanto `situacao` quanto `situacao[]` (axios)
- GET /kpis/volume_em_cobranca → total de CDAs com `agrupamento_situacao == 0`

## Frontend (React + Vite)
1) Instalar dependências
- cd frontend
- npm install

2) Rodar em desenvolvimento
- npm run dev
- Abra: localhost

O Vite está configurado para proxyar as rotas `/resumo`, `/cda` e `/kpis` para http://localhost:8000.

### Observações de UI
- Tema escuro/claro (toggle no cabeçalho)
- Gráficos com pop-up: clique no cartão para abrir e use ESC ou clique fora para fechar
- Pizzas: valores (percentual/absoluto) aparecem em legenda abaixo do gráfico

- Os arquivos `.json` devem estar na pasta `data/` na raiz do projeto. A API lê diretamente desse diretório.

##notas
- Esse projeto foi criado para um processo seletivo do LAMDEC UFRJ e utiliza os dados disponibilizados em json pelo lab. 
- Todas as bibliotecas e dependecias foram adicionadas a esse repositório para rodarem mais facilmente quando avaliarem o projeto.