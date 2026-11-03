#!/usr/bin/env python3
"""Relógio do mundo do Rafael: 1 hora real = 1 dia na simulação.

Uso:
  python3 agente-sobrevivencia/relogio.py iniciar [CIDADE]   # zera o mundo e começa o dia 1 agora
  python3 agente-sobrevivencia/relogio.py                    # mostra dia/hora atual e dias pendentes
  python3 agente-sobrevivencia/relogio.py registrar DIA SALDO  # marca até que dia o diário foi escrito
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path

ESTADO = Path(__file__).with_name("estado.json")
SEGUNDOS_REAIS_POR_DIA = 3600  # 1 hora real = 1 dia do Rafael


def agora():
    return datetime.now(timezone.utc)


def carregar():
    if not ESTADO.exists():
        sys.exit("Mundo ainda não iniciado. Rode: relogio.py iniciar [CIDADE]")
    return json.loads(ESTADO.read_text(encoding="utf-8"))


def salvar(e):
    ESTADO.write_text(json.dumps(e, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def status(e):
    inicio = datetime.fromisoformat(e["inicio_real"])
    seg = (agora() - inicio).total_seconds()
    dia = int(seg // SEGUNDOS_REAIS_POR_DIA) + 1
    frac = (seg % SEGUNDOS_REAIS_POR_DIA) / SEGUNDOS_REAIS_POR_DIA
    minutos_sim = int(frac * 24 * 60)
    return {
        "cidade": e["cidade"],
        "dia_atual": dia,
        "hora_no_mundo": f"{minutos_sim // 60:02d}:{minutos_sim % 60:02d}",
        "ultimo_dia_registrado": e["ultimo_dia_registrado"],
        "dias_pendentes": max(0, dia - 1 - e["ultimo_dia_registrado"]),
        "saldo_registrado": e["saldo"],
        "inicio_real": e["inicio_real"],
    }


def main():
    args = sys.argv[1:]
    if args and args[0] == "iniciar":
        cidade = " ".join(args[1:]) or "Belo Horizonte, MG"
        e = {"inicio_real": agora().isoformat(), "cidade": cidade,
             "ultimo_dia_registrado": 0, "saldo": 500.00}
        salvar(e)
    elif args and args[0] == "registrar":
        e = carregar()
        e["ultimo_dia_registrado"] = int(args[1])
        if len(args) > 2:
            e["saldo"] = float(args[2].replace(",", "."))
        salvar(e)
    else:
        e = carregar()
    print(json.dumps(status(e), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
