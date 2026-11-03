import json
from datetime import date, timedelta
D1=date(2026,10,24)
saldo=475.0
# (semana, dias, eventos[(desc, entrada, saida)])
W=[
("Sem 2 (D11–D14)",[
 ("D11 Ceasa; cobrou o Geraldo e recebeu R$90 + os R$30 atrasados por Pix",120,22),
 ("D12 entrevista no atacadista (vaga do SINE): aprovado p/ ajudante de carga CLT, R$1.750 + VA + VT, escala 6x1",0,12),
 ("D13 exame admissional; Centro POP: pediu inscrição no Bolsa Moradia (fila de espera)",0,10),
 ("D14 renovou pensão 1 semana",0,190+15),
]),
("Sem 3 (D15–D21)",[
 ("D15–D20 começou no atacadista; refeitório na empresa resolve o almoço",0,6*12),
 ("D21 trocou a pensão semanal por quarto mensal em Contagem (R$650/mês); só tinha R$300 — negociou o resto pro dia do vale. Semana mais perigosa: sobrou R$44",0,300),
 ("D21 folga: Ceasa de madrugada com o Geraldo",90,20),
]),
("Sem 4 (D22–D28)",[
 ("D22–D27 trabalho; cartão VA chegou (R$300/mês) = compras do mês",0,6*8),
 ("D28 vale de 40% do salário (adiantamento); pagou os R$350 do quarto",520,350),
 ("D28 folga: testou latinha depois de jogo no Mineirão: 7kg em 5h",42,8),
]),
("Sem 5 (D29–D35)",[
 ("D29–D34 trabalho; Black Friday (D35) com hora extra",180,6*8),
 ("D30 RG (CIN) pronto na UAI, de graça",0,0),
 ("D33 folga: alugou e-bike de entrega por 1 dia e testou app de entrega (6h)",130,45),
]),
("Sem 6 (D36–D42)",[
 ("D36–D41 trabalho; inscrição no PMQER (curso grátis de eletricista predial, noturno, começa em janeiro) com o endereço novo",0,6*8),
 ("D42 folga: Feira Hippie montando barracas",80,10),
 ("D42 celular: plano pré-pago do mês",0,30),
]),
("Sem 7 (D43–D49)",[
 ("D45 1º salário (saldo de novembro)",680,0),
 ("D43–D48 trabalho; comprou botina e calça (roupa de trabalho própria)",0,6*8+120),
 ("D49 folga: Ceasa em semana de Natal paga mais",120,20),
]),
("Sem 8 (D50–D56)",[
 ("D50–D55 trabalho; hora extra de Natal",220,6*8),
 ("D51 aluguel do quarto",0,650),
 ("D56 folga: descanso (cansaço 9/10 — escolheu não trabalhar)",0,15),
]),
("Sem 9 (D57–D63)",[
 ("D58 vale de 40% + 1ª/2ª parcela do 13º proporcional",600+290,0),
 ("D57–D62 trabalho; ceia de Natal com colegas (vaquinha)",0,6*8+40),
 ("D63 folga (Natal): lavou carros na rua do bairro com balde e pano próprios",110,25),
]),
("Sem 10 (D64–D70)",[
 ("D64–D69 trabalho; Réveillon de folga: vendeu água e refrigerante em festa de bairro em Contagem (isopor R$60 + estoque R$120)",290,6*8+180),
 ("D70 contrato de experiência renovado (45+45) — bom sinal de efetivação",0,0),
]),
("Sem 11 (D71–D77)",[
 ("D74 salário de dezembro",895,0),
 ("D71–D76 trabalho; começou o curso de eletricista (noite, 3x/semana)",0,6*8),
 ("D77 folga: Ceasa",90,20),
 ("D72 inscrição pra credencial de ambulante do Carnaval de BH (fica de olho no edital da PBH/Belotur)",0,0),
]),
("Sem 12 (D78–D84)",[
 ("D78–D83 trabalho + curso",0,6*10),
 ("D81 aluguel",0,650),
 ("D84 folga: ajudou o professor do curso num serviço de fiação (aprendizado pago)",100,10),
]),
("Sem 13 (D85–D91)",[
 ("D89 vale 40%",600,0),
 ("D85–D90 trabalho + curso",0,6*10),
 ("D91 folga: Ceasa",90,20),
]),
("Sem 14 (D92–D98)",[
 ("D92–D97 trabalho + curso; Bolsa Moradia: saiu da fila (não está mais em situação de rua — saiu por conta própria)",0,6*10),
 ("D98 folga: 1º servicinho elétrico próprio (troca de chuveiro e tomadas pra vizinha), indicação boca a boca",120,25),
]),
("Sem 15 (D99–D105)",[
 ("D104 salário de janeiro",895,0),
 ("D99–D104 trabalho; credencial de ambulante retirada; comprou estoque do Carnaval no atacado (desconto de funcionário)",0,6*10+420),
 ("D105 folga: troca de 2 resistências de chuveiro + 1 disjuntor",150,20),
]),
("Sem 16 (D106–D112) — CARNAVAL",[
 ("D106 sábado de Carnaval (folga trocada): bebida no bloco, vendeu tudo",780,40),
 ("D109 terça de Carnaval (folga): 2º dia de bloco + latinhas no fim",640,30),
 ("D107–D112 trabalho (atacadista lotado pós-Carnaval)",0,4*10),
 ("D111 aluguel",0,650),
]),
("Sem 17 (D113–D120)",[
 ("D113–D119 trabalho + fim do curso; conclusão do PMQER — certificado de eletricista predial",0,6*10),
 ("D116 abriu MEI (grátis no gov.br), DAS de serviços ~R$86/mês",0,0),
 ("D118 folga: 2 serviços elétricos por indicação no zap",260,30),
 ("D119 vale 40%",600,0),
 ("D120 efetivado no atacadista após 90 dias",0,0),
]),
]
linhas=[];hist=[];serie=[("D10",475)]
for nome,evs in W:
    i=sum(e[1] for e in evs); o=sum(e[2] for e in evs)
    saldo+=i-o
    hist.append(f"{nome}: +R${i:.0f}, -R${o:.0f}, saldo R${saldo:.0f}; "+"; ".join(e[0] for e in evs))
    serie.append((nome.split()[1].strip('()').split('–')[-1].rstrip(')'),round(saldo)))
print(json.dumps({"saldo":saldo,"serie":serie},ensure_ascii=False))
json.dump({"hist":hist,"serie":serie,"saldo":saldo},open('sim_out.json','w'),ensure_ascii=False)
for h in hist: print(h[:110])
print("D120 =",D1+timedelta(days=119))
