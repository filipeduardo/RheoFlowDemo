# RheoFlow

Interactive browser-based simulator for fully developed flow of generalized Newtonian fluids in circular ducts.

## Models

- Newtonian
- Power-Law
- Bingham
- Herschel–Bulkley

The application visualizes velocity and shear-stress profiles, the unyielded plug region, animated flow, wall stress, flow rate, and the plasticity index

\[
\mathrm{Pl}=\frac{\tau_0}{\tau_w}=\frac{R_p}{R}.
\]

## Run locally

Open `index.html` directly or serve the repository with any static HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Pushing to `main` will trigger the workflow in `.github/workflows/pages.yml`.
4. The site will be published at:

https://filipeduardo.github.io/RheoFlowDemo/

---

# Documentação Técnica

> Versão em português brasileiro da documentação interna do simulador.

## 1. Visão Geral e Arquitetura

O RheoFlow é uma aplicação web estática de página única. Não há backend; todos os cálculos são executados no navegador.

| Arquivo | Propósito |
|---------|-----------|
| `index.html` | Estrutura do DOM, controles, layout do painel de métricas e espaços reservados para as equações. |
| `styles.css` | Estilos visuais, layout responsivo e variáveis de escalabilidade de acessibilidade. |
| `app.js` | Toda a lógica do simulador: conversão de unidades, reologia, solvers, visualização e interatividade. |
| MathJax (CDN) | Renderiza as strings LaTeX geradas por `updateEquation()`. |

### Suposições fundamentais

Os modelos exibidos assumem **escoamento incompressível, permanente, laminar, axisimétrico, completamente desenvolvido e sem deslizamento na parede**. As equações são expressas internamente em SI e renderizadas em SI no painel de equações. As entradas e saídas podem ser exibidas em um sistema de unidades escolhido pelo usuário.

## 2. Unidades e Conversões

### 2.1 `defaults` — valores-base em SI

Todo o cálculo interno usa SI. O objeto `defaults` armazena os valores-base em SI usados quando uma entrada é inválida:

| Variável | Valor em SI | Significado |
|----------|-------------|-------------|
| `model` | `'herschelBulkley'` | Modelo reológico padrão. |
| `radius` | `0,05` m | Raio padrão do duto `R`. |
| `pressureGradient` | `12000` Pa/m | Gradiente de pressão padrão `G = -dp/dz`. |
| `viscosity` | `0,001` Pa·s | Viscosidade padrão `μ` (Newtoniano/Bingham). |
| `consistency` | `0,001` Pa·sⁿ | Índice de consistência padrão `H`. |
| `flowIndex` | `0,6` | Índice de escoamento padrão `n`. |
| `yieldStress` | `0,6` Pa | Tensão limite padrão `τ₀` (0 para Newtoniano/Lei de Potência; 0,5 para Bingham). |
| `flowMode` | `'pressureGradient'` | Modo padrão de especificação do escoamento. |
| `pressureSpecMode` | `'gradient'` | Forma padrão do gradiente de pressão. |
| `pressureDifference` | `6000` Pa | Diferencial de pressão padrão `Δp`. |
| `tubeLength` | `0,5` m | Comprimento padrão do tubo `L`. |
| `flowRate` | `0,001` m³/s | Vazão padrão `Q` (exibida como `86,4 m³/d`). |
| `density` | `1000` kg/m³ | Densidade padrão `ρ`. |
| `soundSpeed` | `1500` m/s | Velocidade do som padrão `c`. |

### 2.2 `units` — estado atual das unidades exibidas

As quatro dimensões-base são `pressure`, `length`, `flowRate`, `density`. `pressureGradient` e `velocity` são dimensões derivadas:

- Unidade de `pressureGradient` = `<unidade de pressão>/<unidade de comprimento>`
- Unidade de `velocity` = `<unidade de comprimento>/s`

### 2.3 `unitOptions` — fatores de conversão

| Dimensão | Opções | `toBase` (multiplicar para SI) | Observações |
|-----------|---------|--------------------------------|-------------|
| `pressure` | Pa, kPa, psi | `1`, `1000`, `6894,757293168` | — |
| `length` | m, ft, in | `1`, `0,3048`, `0,0254` | — |
| `flowRate` | m³/d, bbl/d, MMSCFD, GPM | `1/86400`, `0,158987294928/86400`, `1e6*0,028316846592/86400`, `0,003785411784/60` | Converte vazão volumétrica para m³/s. |
| `density` | kg/m³, ppg, °API | `1`, `119,826427`, `141,5/(API+131,5)*1000` | °API é uma conversão não linear. |

### 2.4 Funções de conversão

- `toSI(value, dimension, unitValue)` — converte um valor exibido para SI.
- `fromSI(value, dimension, unitValue)` — converte um valor em SI para a unidade exibida.
- `getUnitLabel(dimension, unitValue)` — retorna o rótulo exibido.

### 2.5 Leitura e escrita das entradas

- `readDisplay(input, dimension, fallbackSI)` / `readNonNegativeDisplay(...)` — converte entradas numéricas para SI, recuando para valores padrão.
- `setInputValue(input, value)` — escreve um número formatado por `formatNumeric()`.
- `formatValue(value, digits)` — formatador voltado ao usuário. Usa notação científica com `displaySciDigits` (2 ou 6) quando `|valor| ≥ 10000` ou `|valor| < 0,001`; caso contrário, usa `toLocaleString('pt-BR')`.

### 2.6 Propagação de mudança de unidade (`applyUnits`)

Quando o usuário altera uma unidade:

1. Os valores em SI de todas as entradas são capturados.
2. A unidade é atualizada.
3. Cada entrada é reescrita na nova unidade.
4. Se houver geometria não homogênea, ela é regenerada na nova unidade de comprimento e recalculada.
5. `refresh()` atualiza todos os valores exibidos.

Assim, o estado físico é preservado; apenas os números e rótulos mudam.

## 3. Parâmetros de Entrada (`getParameters`)

`getParameters()` coleta o estado atual e retorna valores em SI:

| Campo | Fonte | Unidade SI | Observações |
|-------|-------|------------|-------------|
| `model` | `#modelSelect` | — | `newtonian`, `powerLaw`, `bingham`, `herschelBulkley`. |
| `R` | `#radius` | m | Da entrada de raio. |
| `pressureGradient` | `#pressureGradientInput` | Pa/m | `G = -dp/dz`. |
| `pressureDifference` | `#pressureDifference` | Pa | `Δp`. |
| `tubeLength` | `#tubeLength` | m | `L`. |
| `flowRate` | `#flowRateInput` | m³/s | `Q`. |
| `density` | `#density` | kg/m³ | `ρ`. |
| `soundSpeed` | `#soundSpeed` | m/s | `c`. |
| `mu` | `#viscosityNumber` | Pa·s | `μ`. |
| `H` | `#consistencyNumber` | Pa·sⁿ | `H`. |
| `n` | `#flowIndexNumber` | — | `n` (limitado a `≥ 0,2`). |
| `tau0` | `#yieldStressNumber` | Pa | `τ₀`. |

### 3.1 Entradas reológicas por modelo

- **Newtoniano**: apenas viscosidade `μ`.
- **Lei de Potência**: consistência `H` e índice `n`.
- **Bingham**: viscosidade `μ` e tensão limite `τ₀`.
- **Herschel–Bulkley**: consistência `H`, índice `n` e tensão limite `τ₀`.

O slider de `τ₀` tem máximo `max(1, 1,5 τ_w)`, onde `τ_w = G R / 2`.

## 4. Modos de Escoamento

`#flowMode` seleciona a variável independente. `#pressureSpecMode` seleciona a forma do gradiente.

### 4.1 Modo de gradiente de pressão

- **Gradiente direto**: `G` é lido diretamente; `Δp = G L`.
- **Diferencial de pressão**: `Δp` é lido; `G = Δp / L`.

### 4.2 Modo de vazão fixa

`Q` é lido. `G` é resolvido numericamente por `solveForG(targetQ, params)` até que `calculate(...).flowRate` iguale `targetQ`. O algoritmo usa `minG = 2τ₀/R`, uma estimativa analítica de `G(Q)` e bisseção.

### 4.3 Ciclo de atualização homogêneo

`refresh()` determina `G`, sincroniza a faixa de `τ₀`, itera para consistência, computa `Δp`, chama `calculate()`, `updateMetrics()`, `updateEquation()` e redesenha os gráficos.

## 5. Modelos Reológicos e `calculate()`

### 5.1 Definições comuns

```
τ_w = G R / 2
flowing = (sem tensão limite) OU (τ_w > τ₀)
Pl = τ₀ / τ_w = R_p / R
R_p = Pl * R
```

`calculate()` amostra 201 pontos radiais e retorna perfis de velocidade/tensão/taxa de cisalhamento, `maxVelocity`, `meanVelocity` e `flowRate`.

### 5.2 Perfis de velocidade

- **Newtoniano**:
  ```
  U_z(r) = G (R² - r²) / (4 μ)
  Q = π G R⁴ / (8 μ)
  ```
- **Lei de Potência**:
  ```
  U_z(r) = (nR/(n+1)) (τ_w/H)^(1/n) [1 - (r/R)^((n+1)/n)]
  ```
- **Bingham**:
  - Plugue (`r ≤ R_p`): `U_z = (R τ_w / 2μ) (1 - Pl)²`
  - Região cisalhada (`R_p < r ≤ R`): `U_z = (R τ_w / 2μ) [(1 - Pl)² - (r/R - Pl)²]`
  - `Q = π G R⁴ / (8 μ) [1 - (4/3)Pl + (1/3)Pl⁴]`
- **Herschel–Bulkley**: mesma estrutura de Bingham, com lei de potência na região cisalhada.

### 5.3 Integração da vazão

```js
areaIntegral = Σ 0,5 (v_i r_i + v_{i+1} r_{i+1}) (r_{i+1} - r_i)
Q = 2 π areaIntegral
V = Q / (π R²)
```

## 6. Diagnósticos e Valores Exibidos

### 6.1 Métricas principais

- `U_max` — velocidade máxima (eixo).
- `U` — `Q / (π R²)`.
- `Q` — vazão volumétrica.
- `τ_w` — `G R / 2`.

### 6.2 Diagnósticos

| Diagnóstico | Símbolo | Fórmula |
|-------------|---------|---------|
| `G` | `G` | `params.G` |
| `Δp` | `Δp` | `G L` |
| `Pl` | `Pl` | `τ₀ / τ_w` |
| `R_p` | `R_p` | `Pl R` |
| `A_nc` | `A_nc` | `Pl² × 100 %` |
| `γ̇_w` | `γ̇_w` | exata: `τ_w/μ` (Newtoniano), `(τ_w/K)^(1/n)` (Lei de Potência), `(τ_w−τ₀)/μ` (Bingham), `((τ_w−τ₀)/K)^(1/n)` (Herschel–Bulkley) |
| `m` | `m` | `n K γ̇_app^n / (τ₀ + K γ̇_app^n)`, com `γ̇_app = 8V/D` |
| `Re_HBE` | `Re_HBE` | `ρ V^(2-n) D^n / [ (τ₀/8)(D/V)^n + K ((3m+1)/(4m))^n 8^(n-1) ]` |
| `f_D` | `f_D` | `64/Re_HBE` laminar; Dodge–Metzner turbulento; transição suavizada `w=(Re_HBE−2100)/900` para `2100<Re_HBE<3000` |
| `Δp_DW` | `Δp_DW` | `f_D (L/D) (ρ V² / 2)`; em `Re_HBE>2100` este valor substitui `G L` como Δp ativo |
| `Ma` | `Ma` | `V / c` |

onde `K = μ` para Newtoniano/Bingham e `K = H` para Lei de Potência/Herschel–Bulkley; `D = 2R`.

### 6.3 Distintivo de estado

Possíveis estados: `Sem escoamento`, `Escoando`, `Turbulento`, `Supersônico`, `Turbulento / Supersônico`, com base em `flowing`, `reHbe > 2100` e `mach > 1`.

## 7. Duto Não Homogêneo

### 7.1 Entrada da geometria

Textarea com duas colunas `x r` (posição axial e raio local). Apenas números, espaços, sinais, expoentes e pontos decimais. `x` deve ser estritamente crescente e `r > 0`.

### 7.2 Interpolação

- **Linear**: interpolação linear entre pontos.
- **Cúbica**: PCHIP (Fritsch–Carlson) monótono; preserva sinal e evita oscilações/raios negativos. Recua para linear com menos de 3 pontos.

`radiusAt(points, x, mode)` limita o raio mínimo a `1e-6` m e conta trechos truncados para aviso.

### 7.3 Subdivisão

`buildSubsections` cria `N` subseções cilíndricas de raio constante por trecho original. O número total é limitado a 2.000 subseções; `N` é ajustado automaticamente se o limite for ultrapassado. Cada subseção usa o raio no ponto médio.

### 7.4 Cálculo

`calculateNonHomogeneous()`:

1. Determina a vazão global `Q`:
   - Modo vazão fixa: `Q` da entrada.
   - Modo gradiente: resolve `Q` tal que `Σ G_i(Q) dx_i = targetP` usando `solveGlobalQ`.
2. Para cada subseção, `solveSection` calcula o `G_i` local e `dp_i = G_i dx_i`.
3. `totalPressure = Σ dp_i`.
4. `avgRadius = sqrt( (Σ r_i² dx_i) / L )` (raio RMS ponderado pela área).
5. `avgVelocity = Q / (π avgRadius²)`.
6. `avgMach = avgVelocity / c`.
7. `reMax` e `reMedian` por subseção.

### 7.5 Resolução da vazão global

`solveGlobalQ(targetP, ...)`:

1. `thresholdPressure = Σ (2 τ₀ / r_i) dx_i`. Se `targetP ≤ thresholdPressure`, `Q = 0`.
2. Estima `Q` analiticamente.
3. Delimita por `Q = 0` e `Q` crescente.
4. Refina por regula falsi (Illinois) com tolerância `1e-5`.

`verifyNHResults()` loga no console o erro máximo de `Q` entre subseções e o erro de `Δp`.

### 7.6 Painel de resultados não homogêneo

- `Δp total` — soma das quedas de pressão.
- `Raio médio R` — `avgRadius`.
- `Velocidade média U` — `avgVelocity`.
- `Reynolds HBE máximo` / `Reynolds HBE mediano` — estatísticas por subseção.
- `Mach médio` — `avgMach`.
- `Seções N` — número total de subseções.
- Tabela de trechos originais com `x`, `Δx`, `R`, `U`, `Re_HBE`, `Δp`.

## 8. Feixe de Dutos

O modo **Feixe de dutos** trata `N` dutos circulares idênticos dispostos em paralelo, cada um com o mesmo raio `r` e sujeito ao mesmo Δp ao longo do comprimento `L`.

### 8.1 Entradas

- **Número de dutos**: `N` (inteiro, 1–100 000). O envelope é o menor círculo que contém os centros mais o raio do duto.
- **Porosidade**: `φ` e área total do envelope `A_total`. O simulador calcula `N = round(φ A_total / (π r²))` e exibe a porosidade efetiva `φ_eff = N π r² / A_total`.
- Raio do duto `r` e comprimento `L` são os mesmos controles do modo homogêneo.

### 8.2 Empacotamento

- Modo **contagem**: empacotamento hexagonal (triangular) com espaçamento `2r`, centrado na origem; `R_env = r + d_max`.
- Modo **porosidade**: grade hexagonal com espaçamento `s = sqrt(2 A_total / (N √3))`. Se `s < 2r`, o espaçamento é limitado a `2r` e um aviso indica que `φ` supera o limite de empacotamento (`π / (2√3) ≈ 0,907`). O empacotamento é apenas visual; a vazão depende apenas de `N` e `r`.

### 8.3 Cálculo

- Por duto: resolve `G` a partir de `Q_total / N` (modo vazão fixa) ou usa `G` dado (modo gradiente de pressão).
- `Q_total = N Q_duto`.
- `Δp` é o mesmo para todos os dutos e usa `dpEffective` (laminar exato ou Dodge–Metzner suavizado).
- Cada duto usa os mesmos perfis, tensões e Reynolds do modo homogêneo.

### 8.4 Painel de resultados

- `Q_total`, `Δp`, `N`, `φ_eff`, `R_env`, `U_duto`.
- Diagnósticos por duto: `τ_w`, `Pl`, `Re_HBE`, `Ma`.
- Visualização da seção transversal com o envelope e os dutos.
- Fluxo de uso: **Gerar geometria** gera e mostra o empacotamento; **Calcular** resolve o escoamento e mostra os resultados. Depois dos dois passos os botões tornam-se alternâncias entre `Geometria` e `Resultado`. Mudar qualquer entrada de geometria invalida a geometria; mudar parâmetros de escoamento invalida apenas o resultado.

### 8.5 Exportação CSV

O CSV do feixe (`rheoflow-bundle-<N>.csv`) contém uma linha de comentário com `N`, `φ_eff`, `A_total` e `Q_total`, seguida do perfil radial por duto: `r_m, r_over_R, velocity_m_per_s, shear_stress_Pa, shear_rate_per_s`.

## 9. Visualização

### 9.1 Modo homogêneo

- **Perfil radial**: `U(r/R)` (ciano) e `τ(r/R)` (âmbar tracejado), região de plugue em violeta.
- **Escoamento longitudinal**: duto pseudo-3D com partículas cuja velocidade depende da razão `U(y/R) / U_max`.

### 9.2 Modo não homogêneo

- **Perfil do duto**: `r` vs `x` com pontos de entrada e subdivisões.
- **Escoamento no duto**: duto cônico com partículas aceleradas nas seções mais estreitas.

A animação é conduzida por `requestAnimationFrame`.

## 10. Acessibilidade e Controles da UI

- **Popover de acessibilidade**: alternar painéis, tamanho da fonte (`1×`, `1,15×`, `1,3×`) e espessura das linhas (`1×`, `1,5×`, `2×`).
- **Alternância de tema**: claro/escuro.
- **Restaurar**: volta para `defaults` e SI, limpa geometria NH.
- **Exportar CSV**: no modo homogêneo baixa `rheoflow-<modelo>.csv` com `r_m, r_over_R, velocity_m_per_s, shear_stress_Pa, shear_rate_per_s`; no modo não homogêneo baixa `rheoflow-nh-<N>.csv` com `x_m, dx_m, r_m, velocity_m_per_s, re_hbe, dp_Pa`.
- **Clique para precisão**: alterna `displaySciDigits` entre 2 e 6 nas notações científicas.

## 11. Comportamento em Cenários

- **Sem escoamento**: se `τ_w ≤ τ₀` (homogêneo) ou `targetP ≤ thresholdPressure` (NH), `Q = 0` e o distintivo mostra `Sem escoamento`.
- **Mudança de unidade**: preserva o estado físico; apenas rótulos e números mudam. As equações permanecem em SI.
- **Mudança de modelo**: atualiza controles, equações e resultados; marca NH como sujo.
- **Modos de escoamento**:
  - Gradient direto: `G` fixo.
  - Diferencial: `Δp` fixo, `G = Δp/L`.
  - Vazão fixa: `Q` fixo, `G` resolvido iterativamente.
- **Transição turbulento**: quando `Re_HBE > 2100` o diferencial de pressão ativo passa a usar `f_D` via Dodge–Metzner, com suavização linear em `[2100, 3000]` para evitar salto no resultado.
- **Caveat para fluidos cedentes**: quando `τ₀ > 0` e o regime é laminar, `Re_HBE` e `Δp_DW` são aproximações válidas; o erro cresce com `Pl⁴/4` (≈ +16% em `Pl = 0,9` para Bingham). Os perfis de velocidade mostrados continuam sendo os laminares exatos.
- **Convergência NH**: aumentar subdivisões refina a integração e `Δp` converge.
- **Entradas extremas**: raios < `1e-6` m são limitados; `G`/`Q` altos são delimitados até `1e12`.

## 12. Referência Rápida

| Símbolo | Unidade SI | Cálculo |
|---------|------------|---------|
| `R` | m | Entrada |
| `L` | m | Entrada |
| `G` | Pa/m | Entrada / `Δp/L` / resolvido |
| `Δp` | Pa | `G L` se `Re_HBE ≤ 2100`; senão `f_D (L/D) (ρ V² / 2)` com `f_D` suavizado |
| `Q` | m³/s | Integração do perfil ou entrada |
| `V` / `U` | m/s | `Q / (π R²)` ou `Q / (π R_avg²)` |
| `U_max` | m/s | Velocidade no eixo |
| `τ_w` | Pa | `G R / 2` |
| `τ₀` | Pa | Entrada |
| `Pl` | — | `τ₀ / τ_w` |
| `R_p` | m | `Pl R` |
| `γ̇_w` | s⁻¹ | exata no contorno: `τ_w/μ`, `(τ_w/K)^(1/n)`, `(τ_w−τ₀)/μ` ou `((τ_w−τ₀)/K)^(1/n)` conforme o modelo |
| `m` | — | `n K γ̇_app^n / (τ₀ + K γ̇_app^n)`, `γ̇_app = 8V/D` |
| `Re_HBE` | — | Fórmula de Madlener et al. (2009) |
| `f_D` | — | `64/Re_HBE` laminar; Dodge–Metzner turbulento; transição suavizada |
| `Δp_DW` | Pa | `f_D (L/D) (ρ V² / 2)` |
| `Ma` | — | `V / c` |
| `R_avg` | m | `sqrt( (Σ r_i² dx_i) / L )` |
| `U_avg` | m/s | `Q / (π R_avg²)` |
| `Ma_avg` | — | `U_avg / c` |

## 13. Notas para Desenvolvedores

- Todos os números exibidos usam `formatValue`, que respeita `displaySciDigits` (2 ou 6).
- Renderização das equações via `MathJax.typesetPromise`, com `debounce` de 150 ms para evitar trabalho excessivo durante digitação.
- Canvas respeita `devicePixelRatio`, usa cache de `getBoundingClientRect` e `fontScale`/`lineWidthScale` para acessibilidade.
- `result` global armazena o cálculo homogêneo; `nhGeometry` armazena a geometria e resultados não homogêneos.

---

Para a versão completa e detalhada, consulte também `docs/RheoFlow-Documentacao.md`.
