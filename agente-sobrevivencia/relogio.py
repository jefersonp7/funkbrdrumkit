#!/usr/bin/env python3
"""Relógio e memória do mundo do Rafael: 1 hora real = 1 dia na simulação.

O estado.json é a ÚNICA memória que o agente lê (o diario.md é só arquivo para humanos).

Uso:
  relogio.py iniciar [CIDADE]        zera o mundo e começa o dia 1 agora
  relogio.py                         mostra relógio + estado completo (o que o agente precisa)
  relogio.py salvar '<json>'         mescla campos no estado. Ex.:
      relogio.py salvar '{"ultimo_dia_registrado": 3, "saldo": 431.5, "itens": ["mochila","chip"]}'
      "historico_add": "linha"  acrescenta 1 linha ao histórico (resumo de dia/semana)
      "dias_detalhe": [...]     substitui as linhas detalhadas da semana corrente
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path

ESTADO = Path(__file__).with_name("estado.json")
SEGUNDOS_REAIS_POR_DIA = 3600  # 1 hora real = 1 dia do Rafael
LIMITE_DETALHE = 7             # acima disso, compactar em resumo semanal


def carregar():
    if not ESTADO.exists():
        sys.exit("Mundo ainda não iniciado. Rode: relogio.py iniciar [CIDADE]")
    return json.loads(ESTADO.read_text(encoding="utf-8"))


def salvar(e):
    ESTADO.write_text(json.dumps(e, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def novo(cidade):
    return {
        "inicio_real": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "cidade": cidade,
        "ultimo_dia_registrado": 0,
        "saldo": 500.0,
        "dinheiro_onde": "R$400 no tênis, R$80 no bolso da frente, R$20 na mão",
        "corpo": {"fome": 6, "cansaco": 7, "moral": 3, "seguranca": 5},
        "onde_dorme": "rodoviária",
        "itens": ["roupa do corpo", "mochila"],
        "documentos": {"CPF": "sabe de cabeça", "RG": "perdido", "CadUnico": "não", "conta": "não", "celular": "não"},
        "contatos": [],
        "rendas_testadas": {},
        "renda_total": 0.0,
        "metas": [],
        "historico": [],      # resumos curtos (1 linha por semana fechada)
        "dias_detalhe": [],   # 1 linha por dia da semana corrente
    }


def relogio(e):
    inicio = datetime.fromisoformat(e["inicio_real"])
    seg = (datetime.now(timezone.utc) - inicio).total_seconds()
    dia = int(seg // SEGUNDOS_REAIS_POR_DIA) + 1
    m = int((seg % SEGUNDOS_REAIS_POR_DIA) / SEGUNDOS_REAIS_POR_DIA * 1440)
    pend = max(0, dia - 1 - e["ultimo_dia_registrado"])
    return {
        "dia_atual": dia,
        "hora_no_mundo": f"{m // 60:02d}:{m % 60:02d}",
        "dias_pendentes": pend,
        "narrar_pendentes": "nenhum" if pend == 0 else
            ("1 linha por dia" if pend <= LIMITE_DETALHE else "1 resumo único do período"),
        "compactar_semana": len(e.get("dias_detalhe", [])) >= LIMITE_DETALHE,
    }


def main():
    a = sys.argv[1:]
    if a and a[0] == "iniciar":
        e = novo(" ".join(a[1:]) or "Belo Horizonte, MG")
    else:
        e = carregar()
        if a and a[0] == "salvar":
            patch = json.loads(a[1])
            if "historico_add" in patch:
                e["historico"].append(patch.pop("historico_add"))
            e.update(patch)
        elif a and a[0] == "registrar":  # compatibilidade: registrar DIA SALDO
            e["ultimo_dia_registrado"] = int(a[1])
            if len(a) > 2:
                e["saldo"] = float(a[2].replace(",", "."))
        elif a:
            sys.exit(__doc__)
    salvar(e)
    print(json.dumps({"relogio": relogio(e), "estado": e}, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
