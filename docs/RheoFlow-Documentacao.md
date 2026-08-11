# RheoFlow — Documentação Técnica

Este documento descreve como o simulador RheoFlow trata as variáveis, unidades, conversões e cálculos. Ele foi derivado do código-fonte (`app.js`, `index.html`) e abrange tanto o modo de duto homogêneo quanto o não homogêneo.

---

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

---

## 2. Unidades e Conversões

### 2.1 `defaults` — valores-base em SI

Todo o cálculo interno usa SI. O objeto `defaults` armazena os valores-base em SI usados quando uma entrada é inválida:

| Variável | Valor em SI | Significado |
|----------|-------------|-------------|
| `model` | `'herschelBulkley'` | Modelo reológico padrão. |
| `radius` | `0,05` m | Raio padrão do duto `R`. |
| `pressureGradient` | `12000` Pa/m | Magnitude padrão do gradiente de pressão `G = -dp/dz`. |
| `viscosity` | `0,001` Pa·s | Viscosidade padrão `μ` para Newtoniano/Bingham. |
| `consistency` | `0,001` Pa·sⁿ | Índice de consistência padrão `H`. |
| `flowIndex` | `0,6` | Índice de escoamento padrão `n`. |
| `yieldStress` | `0,6` Pa | Tensão limite padrão `τ₀` (0 para Newtoniano/Lei de Potência; 0,5 para Bingham). |
| `flowMode` | `'pressureGradient'` | Modo padrão de especificação do escoamento. |
| `pressureSpecMode` | `'gradient'` | Forma padrão do gradiente de pressão (gradiente direto). |
| `pressureDifference` | `6000` Pa | Diferencial de pressão padrão `Δp`. |
| `tubeLength` | `0,5` m | Comprimento padrão do tubo `L`. |
| `flowRate` | `0,001` m³/s | Vazão padrão `Q` (exibida como `86,4 m³/d` na UI). |
| `density` | `1000` kg/m³ | Densidade padrão do fluido `ρ`. |
| `soundSpeed` | `1500` m/s | Velocidade do som padrão `c`. |

### 2.2 `units` — estado atual das unidades exibidas

```js
const units = {
  pressure: 'Pa',
  length: 'm',
  velocity: 'm/s',
  flowRate: 'm3/d',
  density: 'kg/m3',
  area: 'm2'
};
```

Essas cinco dimensões-base impulsionam toda a conversão. `pressureGradient` e `velocity` são dimensões **derivadas**:

- Unidade de `pressureGradient` = `<unidade de pressão>/<unidade de comprimento>`
- Unidade de `velocity` = `<unidade de comprimento>/s`

### 2.3 `unitOptions` — fatores de conversão

| Dimensão | Opções | `toBase` (multiplicar para obter SI) | Observações |
|-----------|---------|--------------------------------------|-------------|
| `pressure` | Pa, kPa, psi | `1`, `1000`, `6894,757293168` | — |
| `length` | m, ft, in | `1`, `0,3048`, `0,0254` | — |
| `velocity` | m/s, ft/s, in/s | `1`, `0,3048`, `0,0254` | Independent of `length`; used for velocity labels. |
| `flowRate` | m³/d, bbl/d, MMSCFD, GPM | `1/86400`, `0,158987294928/86400`, `1e6*0,028316846592/86400`, `0,003785411784/60` | Converte vazão volumétrica para m³/s. |
| `area` | m², ft², in² | `1`, `0,09290304`, `0,00064516` | Área total do envelope no modo feixe de dutos. |
| `density` | kg/m³, ppg, °API | `1`, `119,826427`, `141,5/(API+131,5)*1000` | °API é uma conversão não linear; a inversa usa `141,5/(ρ/1000) - 131,5`. |

### 2.4 Funções de conversão

- `toSI(value, dimension, unitValue)` — converte um valor exibido para SI.
- `fromSI(value, dimension, unitValue)` — converte um valor em SI para a unidade exibida.
- `getUnitLabel(dimension, unitValue)` — retorna a string do rótulo exibida ao lado de um valor.

`pressureGradient` continua sendo derivado de `pressure` e `length`. A dimensão `velocity` é independente: seus fatores de conversão seguem as mesmas razões de `length`, mas `units.velocity` controla os rótulos de velocidade sem afetar as unidades de comprimento (e vice-versa).

### 2.5 Leitura e escrita das entradas

- `readDisplay(input, dimension, fallbackSI)` — converte uma entrada numérica positiva para SI, recuando para `fallbackSI` se inválida ou não positiva.
- `readNonNegativeDisplay(input, dimension, fallbackSI)` — igual, mas permite zero.
- `readPositive(input, fallback)` — lê um número positivo para parâmetros reológicos (sem conversão de unidades).
- `setInputValue(input, value)` — escreve um número formatado por `formatNumeric()`, a menos que o input esteja focado.
- `formatNumeric(value)` — preserva até 6 dígitos significativos para valores muito pequenos e remove zeros à direita.
- `formatValue(value, digits)` — formatador voltado ao usuário. Usa `toExponential(displaySciDigits)` quando `|valor| ≥ 10000` ou `|valor| < 0,001`; caso contrário, `toLocaleString('pt-BR')` com `digits` casas decimais. `displaySciDigits` alterna entre `2` e `6` quando o usuário clica em qualquer valor métrico numérico.

### 2.6 Propagação de mudança de unidade (`applyUnits`)

Quando o usuário altera uma unidade via `.unit-select`:

1. Os valores em SI de todas as entradas numéricas são capturados.
2. `units[dimension]` é atualizado.
3. Cada entrada é reescrita com o equivalente na nova unidade.
4. Se existir uma geometria não homogênea, a textarea da geometria é regenerada na nova unidade de comprimento, a geometria é reconstruída e o cálculo NH é refeito.
5. `refresh()` é chamado, de modo que todos os valores exibidos são atualizados para a nova unidade.

Assim, o estado físico é preservado; apenas os números e rótulos exibidos mudam.

---

## 3. Parâmetros de Entrada (`getParameters`)

`getParameters()` coleta o estado atual e retorna um objeto com valores em SI:

| Campo | Fonte | Unidade SI | Observações |
|-------|-------|------------|-------------|
| `model` | `#modelSelect` | — | `newtonian`, `powerLaw`, `bingham`, `herschelBulkley`. |
| `R` | `#radius` | m | Unidade exibida convertida por `toSI(..., 'length')`. |
| `pressureGradient` | `#pressureGradientInput` | Pa/m | `toSI(..., 'pressureGradient')`. |
| `pressureDifference` | `#pressureDifference` | Pa | `toSI(..., 'pressure')`. |
| `tubeLength` | `#tubeLength` | m | `toSI(..., 'length')`. |
| `flowRate` | `#flowRateInput` | m³/s | `toSI(..., 'flowRate')`. |
| `density` | `#density` | kg/m³ | `toSI(..., 'density')`; recua para `defaults.density` se inválido. |
| `soundSpeed` | `#soundSpeed` | m/s | `toSI(..., 'velocity')`. |
| `mu` | `#viscosityNumber` | Pa·s | Limitado a `[0,001; 10]`. |
| `H` | `#consistencyNumber` | Pa·sⁿ | Limitado a `[0,001; 100]`. |
| `n` | `#flowIndexNumber` | — | Limitado a `[0,2; 1,8]`. |
| `tau0` | `#yieldStressNumber` | Pa | `Math.max(0, valor)`. |

### 3.1 Entradas reológicas por modelo

O `index.html` usa atributos `data-models` para mostrar/ocultar controles de parâmetros:

| Modelo | Controles visíveis |
|--------|--------------------|
| Newtoniano | Viscosidade `μ` |
| Lei de Potência | Consistência `H`, índice de escoamento `n` |
| Bingham | Viscosidade `μ`, tensão limite `τ₀` |
| Herschel–Bulkley | Consistência `H`, índice de escoamento `n`, tensão limite `τ₀` |

A faixa do slider de tensão limite é sincronizada com a tensão cisalhante na parede atual: `max = max(1, 1,5 τ_w)`, onde `τ_w = G R / 2`. Isso evita que o usuário defina uma tensão limite acima da tensão motriz, embora ainda permita uma pequena extrapolação.

---

## 4. Modos de Escoamento e Como `G` e `Q` São Determinados

`#flowMode` seleciona a variável independente. `#pressureSpecMode` seleciona a forma do gradiente de pressão.

### 4.1 Modo de gradiente de pressão (`flowMode === 'pressureGradient'`)

- **`pressureSpecMode === 'gradient'`** — `G` é lido diretamente de `#pressureGradientInput`. `Δp = G L` é calculado e exibido nos diagnósticos.
- **`pressureSpecMode === 'differential'`** — `Δp` é lido de `#pressureDifference`. `G = Δp / L` é calculado. O `#pressureGradientInput` oculto é atualizado com esse valor, para que os diagnósticos ainda mostrem `G`.

### 4.2 Modo de vazão fixa (`flowMode === 'flowRate'`)

`Q` é lido de `#flowRateInput`. `G` é encontrado numericamente por `solveForG(targetQ, params)` de modo que `calculate({...params, G}).flowRate === targetQ`.

Algoritmo de `solveForG`:

1. Calcula `minG = 2 τ₀ / R` para Bingham/HB (gradiente necessário para iniciar o escoamento).
2. Se `flowRateAtG(minG) ≥ targetQ`, retorna `minG` (caso de plugue/sem escoamento).
3. Estima um `hi` inicial usando `estimateGForQ` e dobra até que a vazão em `hi` exceda `targetQ`.
4. Realiza bisseção entre `lo = minG` e `hi` por até 50 iterações (tolerância `1e-6 * hi`).
5. Retorna a média `(lo + hi) / 2`.

`estimateGForQ` usa aproximações em forma fechada derivadas das relações analíticas `Q(G)`:

- Newtoniano / Bingham: `G ≈ (8 K Q) / (π R⁴) + 2τ₀/R`
- Lei de Potência / Herschel–Bulkley: `G ≈ 2K [ Q(3n+1) / (π n R^((3n+1)/n)) ]^n + 2τ₀/R`

onde `K = μ` para Newtoniano/Bingham e `K = H` caso contrário.

### 4.3 Ciclo de atualização do modo homogêneo (`refresh`)

1. Determina `G` com base no modo.
2. `syncYieldStressRange(R, G)` atualiza o máximo do slider de tensão limite.
3. Laço de até 5 vezes: limita `τ₀` ao máximo do slider; se modo de vazão fixa, re-resolve `G` com o novo `τ₀`.
4. Calcula `pressureDifference = G * L`.
5. `updateControls()` atualiza os campos de entrada visíveis.
6. `result = calculate(params)`.
7. `updateMetrics(result, ...)` e `updateEquation(result)` atualizam o painel e o LaTeX.
8. Desenha o gráfico de perfil e a animação de escoamento.

---

## 5. Modelos Reológicos e o Pipeline `calculate()`

### 5.1 Definições comuns

Para todos os modelos:

```
τ_w = G R / 2                         # tensão cisalhante na parede
flowing = (sem tensão limite) OR (τ_w > τ₀)
Pl = τ₀ / τ_w = R_p / R               # índice de plasticidade (0 para modelos sem tensão limite)
R_p = Pl * R                          # raio do plugue
```

`calculate(model, R, G, mu, H, n, tau0)` constrói 201 amostras radiais (`x = r/R`, `r = x R`) e retorna:

| Campo retornado | Significado |
|-----------------|-------------|
| `params` | Objeto de parâmetros de entrada (incluindo `G`). |
| `G`, `tauW`, `tau0` | Gradiente de pressão, tensão na parede, tensão limite. |
| `flowing` | Booleano indicando se `τ_w` excede `τ₀` (para fluidos com tensão limite). |
| `Pl`, `Rp` | Índice de plasticidade e raio do plugue. |
| `samples` | 201 pontos radiais `{x, r, velocity, stress, shearRate}`. |
| `maxVelocity` | Velocidade máxima (no eixo para casos totalmente escoantes). |
| `meanVelocity` | `Q / (π R²)`, velocidade média volumétrica. |
| `flowRate` | `Q` calculada pela integral analítica de Herschel–Bulkley (forma fechada). |
| `wallShearRate` | Valor exato no contorno: `(τ_w - τ₀) / K` elevado a `1/n` para HB/PL, `(τ_w - τ₀) / μ` para Bingham, `τ_w / μ` para Newtoniano. |

### 5.2 Perfis de velocidade

#### Newtoniano (`model === 'newtonian'`)

```
τ_rz = μ dU/dr
U_z(r) = G (R² - r²) / (4 μ)
Q = π G R⁴ / (8 μ)
```

Perfil parabólico, máximo em `r = 0`.

#### Lei de Potência (`model === 'powerLaw'`)

```
τ_rz = H (-dU/dr)^n
U_z(r) = (n R / (n+1)) (τ_w / H)^(1/n) [1 - (r/R)^((n+1)/n)]
```

- `n < 1`: pseudoplástico (tixotrópico), perfil mais achatado.
- `n = 1`: reduz-se a Newtoniano com `H = μ`.
- `n > 1`: dilatante, perfil mais pontiagudo.

#### Bingham (`model === 'bingham'`)

```
Pl = τ₀ / τ_w
R_p = Pl R
```

Para `r ≤ R_p` (plugue não cisalhado):

```
U_z(r) = (R τ_w / (2 μ)) (1 - Pl)²
```

Para `R_p < r ≤ R`:

```
U_z(r) = (R τ_w / (2 μ)) [(1 - Pl)² - (r/R - Pl)²]
γ̇ = (τ - τ₀) / μ
```

A vazão analítica é:

```
Q = π G R⁴ / (8 μ) [1 - (4/3) Pl + (1/3) Pl⁴]
```

#### Herschel–Bulkley (`model === 'herschelBulkley'`)

```
fator = (n R / (n+1)) (τ_w / H)^(1/n)
```

Para `r ≤ R_p`:

```
U_z(r) = fator (1 - Pl)^((n+1)/n)
```

Para `R_p < r ≤ R`:

```
U_z(r) = fator [(1 - Pl)^((n+1)/n) - (r/R - Pl)^((n+1)/n)]
γ̇ = ((τ - τ₀) / H)^(1/n)
```

A fórmula de vazão exibida no painel de equações é a expressão integrada analiticamente.

### 5.3 Integração da vazão

O código não depende da `Q` em forma fechada para os resultados; calcula `flowRate` numericamente:

```js
areaIntegral = Σ 0,5 (v_i r_i + v_{i+1} r_{i+1}) (r_{i+1} - r_i)
Q = 2 π areaIntegral
V = Q / (π R²)
```

Isso garante consistência entre o perfil, `V` e todos os números de Reynolds/Mach.

---

## 6. Diagnósticos e Valores Exibidos (`updateMetrics`)

`updateMetrics(result, mode)` computa os diagnósticos do painel a partir de `result` (objeto retornado por `calculate`).

### 6.1 Cartões de métricas principais

| Cartão | Fonte | Unidade | Fórmula/Observações |
|--------|-------|---------|---------------------|
| `U_max` | `result.maxVelocity` | velocidade | Velocidade no eixo. |
| `U` (média) | `result.meanVelocity` | velocidade | `V = Q / (π R²)`. |
| `Q` | `result.flowRate` | vazão | Vazão volumétrica. |
| `τ_w` | `result.tauW` | pressão | `G R / 2`. |

### 6.2 Lista de diagnósticos

| Diagnóstico | Símbolo | Cálculo |
|-------------|---------|---------|
| `G` | `G` | `params.G` (exibido como unidade de pressão / unidade de comprimento). |
| `Δp` | `Δp` | `params.G * params.tubeLength`. |
| `Pl` | `Pl` | `τ₀ / τ_w` (0 se `τ₀ = 0`). |
| `R_p` | `R_p` | `Pl * R` (exibido apenas se `τ₀ > 0`). |
| `A_nc` | `A_nc` | `Pl² * 100` como porcentagem. |
| `γ̇_w` | `γ̇_w` | Valor exato no contorno conforme o modelo. |
| `m` | `m` | `n K γ̇_app^n / (τ₀ + K γ̇_app^n)` com `γ̇_app = 8V/D`. |
| `Re_HBE` | `Re_HBE` | Reynolds HBE generalizado de Madlener et al. (2009). |
| `f_D` | `f_D` | `64/Re_HBE` laminar; Dodge–Metzner turbulento; transição suavizada por `w=(Re_HBE-2100)/900` em `[2100,3000]`. |
| `Δp_DW` | `Δp_DW` | `f_D (L/D) (ρ V² / 2)`; torna-se o diferencial ativo quando `Re_HBE > 2100`. |
| `Ma` | `Ma` | `V / c`. |

Nas fórmulas acima:

- `V` = `result.meanVelocity` (`m/s`).
- `D` = `2 R`.
- `n` = índice de escoamento para Lei de Potência/HB, `1` para Newtoniano/Bingham.
- `K` = `μ` para Newtoniano/Bingham, `H` para Lei de Potência/HB.
- `m` = índice local de comportamento de fluxo, limitado a `[0,1; 1]` para a correlação de atrito turbulento.

### 6.3 Fator de atrito de Darcy Dodge–Metzner

Para `Re_HBE > 2100`, o código resolve a equação implícita:

```
1/√f_D = (2 / m^0,75) log10[ Re_HBE (f_D / 4)^(1 - m/2) ] - 0,2 / m^1,2
```

por iteração de ponto fixo em `y = 1 / √f_D`. Para `m = 1`, isso reduz-se à equação de Prandtl–Nikuradse para tubos lisos.

### 6.4 Distintivo de estado de escoamento

O distintivo no canto superior direito é determinado por:

```js
flowing = result.flowing && result.maxVelocity > 0
turbulent = reHbe > 2100
supersonic = mach > 1
```

Estados possíveis: `Sem escoamento`, `Escoando`, `Turbulento`, `Supersônico`, `Turbulento / Supersônico`.

---

## 7. Duto Não Homogêneo

### 7.1 Entrada da geometria

`#geometryInput` aceita duas colunas de números: posição axial `x` e raio local `r`. Os valores são sanitizados para permitir apenas dígitos, espaços, sinais, expoentes e pontos decimais. O parser:

1. Divide por espaços em branco.
2. Exige número par de tokens (pelo menos 4).
3. Converte ambas as colunas para SI usando a unidade de comprimento atual.
4. Ordena por `x`.
5. Valida `x` estritamente crescente e `r > 0`.

### 7.2 Interpolação do perfil

`#profileMode` escolhe `linear` ou `cúbico`:

- **Linear**: `r(x) = r_i + t (r_{i+1} - r_i)` com `t = (x - x_i) / (x_{i+1} - x_i)`.
- **Cúbica**: PCHIP (Fritsch–Carlson) monótono; evita oscilações e raios negativos. Recua para linear se houver menos de 3 pontos.

`radiusAt(points, x, mode)` retorna `max(1e-6, raio_interpolado)` para evitar divisão por zero em seções extremamente estreitas.

### 7.3 Subdivisão

`buildSubsections(points, subdivisions, mode)` cria `N` subseções cilíndricas de raio constante **por trecho original**, onde `N` é limitado a 2.000 subseções no total; o valor de entrada é ajustado automaticamente quando necessário. Cada subseção armazena:

- `xLeft`, `xRight`, `xCenter`
- `r` = `radiusAt(points, xCenter, mode)`
- `dx = xRight - xLeft`
- `segmentIndex` (a qual trecho original pertence)

O valor exibido `Seções N` é o número total de subseções.

### 7.4 Cálculo

`calculateNonHomogeneous()`:

1. Lê os parâmetros globais atuais.
2. Determina a vazão global `Q`:
   - **Modo de vazão fixa**: `targetQ = baseParams.flowRate`.
   - **Modo de gradiente de pressão**: `targetP = Δp` ou `G * L`. `targetQ = solveGlobalQ(targetP, baseParams, subsections)`.
3. Para cada subseção, `solveSection(baseParams, R_i, dx_i, {flowMode: 'flowRate', targetQ})` calcula o `G_i` local e `dp_i = G_i dx_i`.
4. `totalPressure = Σ dp_i`.
5. `avgRadius = sqrt( (Σ r_i² dx_i) / L )` — raio médio quadrático (RMS) ponderado pela área.
6. `avgArea = π avgRadius²`.
7. `avgVelocity = targetQ / avgArea` (0 se não há escoamento).
8. `avgMach = avgVelocity / soundSpeed`.
9. `reMax` e `reMedian` são calculados a partir dos `Re` das subseções.
10. `segmentResults` são construídos por trecho original para a tabela de detalhes.

### 7.5 Resolução da vazão global `Q` no modo de gradiente de pressão

`solveGlobalQ(targetP, baseParams, subsections)`:

1. Calcula `thresholdPressure = Σ (2 τ₀ / r_i) dx_i`. Se `targetP ≤ thresholdPressure`, o escoamento está abaixo do limiar de escoamento → `Q = 0`.
2. Estima `Q` analiticamente com `estimateFlowRateForPressure`.
3. Delimita `Q` dobrando até que `totalPressureForQ(hi) ≥ targetP`.
4. Refina por regula falsi (Illinois, 40 iterações, tolerância `1e-5 * targetP`); warm-start com `G` da subseção anterior.

`totalPressureForQ(Q, ...)` soma `G_i(Q) dx_i` para todas as subseções, onde cada `G_i` é encontrado por `solveForG`.

`verifyNHResults()` registra no console o erro máximo de vazão entre subseções e o erro de pressão total para verificação.

### 7.6 Painel de resultados não homogêneo

| Cartão | Fonte | Unidade | Observações |
|--------|-------|---------|-------------|
| `Δp total` | `totalPressure` | pressão | Soma das quedas de pressão das subseções. |
| `Raio médio R` | `avgRadius` | comprimento | Raio RMS ponderado pela área. |
| `Velocidade média U` | `avgVelocity` | velocidade | `Q / (π avgRadius²)`. |
| `Reynolds máximo` | `reMax` | — | Maior `Re` entre as subseções. |
| `Reynolds mediano` | `reMedian` | — | Mediana dos `Re` das subseções. |
| `Mach médio` | `avgMach` | — | `avgVelocity / c`. |
| `Seções N` | `subsections.length` | — | Número total de subseções. |

A tabela de seções individuais (`Seções individuais`) lista cada trecho original com `x`, `Δx`, `R` (subseção central), `U` (velocidade média), `Re` e `Δp`.

---

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

### 8.5 Exportação CSV

O CSV do feixe (`rheoflow-bundle-<N>.csv`) contém uma linha de comentário com `N`, `φ_eff`, `A_total` e `Q_total`, seguida do perfil radial por duto: `r_m, r_over_R, velocity_m_per_s, shear_stress_Pa, shear_rate_per_s`.

## 9. Visualização

### 9.1 Modo homogêneo

- **Gráfico de perfil radial (`#profileCanvas`)**: desenha `U(r/R)` (ciano) e `τ(r/R)` (âmbar tracejado). A região de plugue é destacada em violeta quando `τ₀ > 0`. Passar o cursor mostra `r/R`, `U`, `τ` e `γ̇` naquele ponto.
- **Canvas de escoamento longitudinal (`#flowCanvas`)**: visão pseudo-3D do duto com codificação de cores por velocidade. A velocidade das partículas depende da razão local `U(y/R) / U_max`.

### 9.2 Modo não homogêneo

- **Perfil do duto (`#ductProfileCanvas`)**: plota `r` vs `x`, os pontos originais e as divisões verticais das subseções.
- **Escoamento no duto (`#ductFlowCanvas`)**: desenha o duto cônico e anima partículas. A velocidade horizontal de cada partícula é proporcional à velocidade média local da subseção em que ela se encontra, de modo que trechos mais estreitos (mais rápidos) aceleram as partículas visualmente.

### 9.3 Animação

`requestAnimationFrame` aciona `animate(timestamp)`. `delta` é o tempo de quadro em milissegundos. Os canvas de escoamento recalculam as posições das partículas a cada quadro; o gráfico de perfil é redesenhado apenas em hover ou redimensionamento.

---

## 10. Acessibilidade e Controles da UI

- **Popover de acessibilidade** (`#accessibilityButton`):
  - Alternar visibilidade do painel de configuração / painel de resultados.
  - Tamanho da fonte: `default` (`1×`), `large` (`1,15×`), `larger` (`1,3×`). Armazenado em `--font-scale`.
  - Espessura das linhas: `default` (`1×`), `thick` (`1,5×`), `thicker` (`2×`). Armazenado em `--line-width` e `lineWidthScale`.
- **Alternância de tema**: troca `data-theme` entre claro e escuro, depois redesenha os canvas.
- **Restaurar**: restaura `defaults` e unidades para SI, limpa a geometria NH e redesenha.
- **Exportar CSV**: faz download de `rheoflow-<modelo>.csv` com as colunas `r_m, r_over_R, velocity_m_per_s, shear_stress_Pa, shear_rate_per_s` para as `result.samples` homogêneas.
- **Clique para alternar precisão**: clicar em qualquer `<strong>` numérico dentro de `.metric-card` ou `.diagnostic-list` alterna `displaySciDigits` entre `2` e `6`, re-renderizando todos os valores.

---

## 11. Comportamento em Cenários

### 11.1 Casos sem escoamento

- **Fluido com tensão limite, duto homogêneo**: se `τ_w ≤ τ₀`, `flowing` é falso. O perfil de velocidade é zero em toda parte, `Pl = 1` e o distintivo mostra `Sem escoamento`.
- **Duto não homogêneo, modo de gradiente de pressão**: se `targetP ≤ thresholdPressure`, `solveGlobalQ` retorna `0`. Todas as métricas NH ficam zero e o distintivo mostra `Sem escoamento`.

### 11.2 Mudanças de unidade

Alterar uma unidade preserva o estado físico:

- As entradas são convertidas para a nova unidade.
- Todos os valores métricos/diagnósticos são reexibidos na nova unidade.
- As equações permanecem em SI (uma nota na UI informa isso).
- A geometria NH é regenerada na nova unidade de comprimento.

### 11.3 Mudanças de modelo

Trocar de modelo reológico:

- Oculta/exibe os controles de parâmetros relevantes.
- Atualiza a descrição do modelo e os cartões de equações.
- Recalcula `G`/`Q` e todos os diagnósticos.
- Marca os resultados NH como sujos (requer recálculo).

### 11.4 Modos de gradiente de pressão vs vazão fixa

- **Gradiente de pressão (direto)**: `G` é fixo; `Q`, `U`, `Re`, `Ma` respondem a mudanças de reologia/geometria.
- **Gradiente de pressão (diferencial)**: `Δp` é fixo; `G` é derivado como `Δp/L`; comporta-se como gradiente direto para os cálculos subsequentes.
- **Vazão fixa**: `Q` é fixo; `G` é resolvido iterativamente; aumentar a viscosidade/tensão limite aumenta `G` e `Δp`.

### 11.5 Convergência não homogênea

Aumentar `Subdivisões por trecho` refina a integração:

- `totalPressure` converge à medida que mais subseções são usadas.
- `avgRadius` já é um valor médio ponderado pela área e converge rapidamente.
- `avgVelocity` depende de `targetQ` e `avgRadius`; para `Q` fixo, é fisicamente consistente.
- `Re` por subseção depende do raio local e do `Q` comum.

### 11.6 Entradas extremas

- Raio muito pequeno: `radiusAt` limita a `1e-6` m, evitando `Infinity`/`NaN`.
- `G` ou `Q` muito altos: `solveForG` e `solveGlobalQ` limitam as iterações e delimitam até `1e12` para evitar loops descontrolados.
- Densidade ou velocidade do som muito baixas: `Mach` e `Re` tratam denominadores zero/negativos retornando `0`.

---

## 12. Referência Rápida de Variáveis/Fórmulas

| Símbolo | Nome interno | Unidade SI | Rótulo exibido | Como é calculado |
|---------|--------------|------------|----------------|------------------|
| `R` | `params.R` | m | `m`, `ft`, `in` | Da entrada `#radius`. |
| `L` | `params.tubeLength` | m | `m`, `ft`, `in` | Da entrada `#tubeLength`. |
| `G` | `params.G` | Pa/m | `Pa/m`, `kPa/ft` etc. | Entrada direta, ou `Δp/L`, ou resolvido para `Q`. |
| `Δp` | `pressureDifference` | Pa | `Pa`, `kPa`, `psi` | `G * L` (ou entrada no modo diferencial). |
| `Q` | `flowRate` | m³/s | `m³/d`, `bbl/d` etc. | Por integração do perfil ou entrada. |
| `V` / `U` | `meanVelocity` | m/s | `m/s`, `ft/s`, `in/s` | `Q / (π R²)` ou `Q / (π R_avg²)`. |
| `U_max` | `maxVelocity` | m/s | `m/s`, `ft/s`, `in/s` | Velocidade no eixo a partir do perfil. |
| `τ_w` | `tauW` | Pa | `Pa`, `kPa`, `psi` | `G R / 2`. |
| `τ₀` | `tau0` | Pa | `Pa` | Da entrada `#yieldStressNumber`. |
| `Pl` | `Pl` | — | — | `τ₀ / τ_w` (limitado a `[0,1]`). |
| `R_p` | `Rp` | m | `m`, `ft`, `in` | `Pl * R`. |
| `γ̇_w` | `wallShearRate` | s⁻¹ | `s⁻¹` | Valor exato no contorno: `((τ_w − τ₀)/K)^(1/n)` para HB/PL, `(τ_w − τ₀)/μ` para Bingham, `τ_w/μ` para Newtoniano; para lei de potência isso equivale a `((3n+1)/(4n))(8V/D)` (Rabinowitsch–Mooney). |
| `Re` | `re` | — | — | `8 ρ V² fator / [τ₀ + K fator^n (8V/D)^n]`. |
| `Re_HBE` | `reHbe` | — | — | Reynolds HBE generalizado de Madlener et al. (2009). |
| `m` | `mClamped` | — | — | `n K (8V/D)^n / (τ₀ + K (8V/D)^n)` (η∞ = 0); derivada da lei HBE em relação à taxa de cisalhamento aparente na parede. |
| `f_D` | `fDarcy` | — | — | `64/Re` laminar; Dodge–Metzner turbulento. |
| `Δp_DW` | `darcyWeisbachDp` | Pa | `Pa`, `kPa`, `psi` | `f_D (L/D) (ρ V² / 2)`. |
| `Ma` | `mach` | — | — | `V / c`. |
| `R_avg` | `avgRadius` | m | `m`, `ft`, `in` | `sqrt( (Σ r_i² dx_i) / L )`. |
| `U_avg` | `avgVelocity` | m/s | `m/s`, `ft/s`, `in/s` | `Q / (π R_avg²)`. |
| `Ma_avg` | `avgMach` | — | — | `U_avg / c`. |

---

## 13. Notas para Desenvolvedores

- Todos os números exibidos usam o auxiliar `formatValue`, que respeita `displaySciDigits` (2 ou 6).
- A renderização das equações é assíncrona por meio de `MathJax.typesetPromise`.
- O desenho em canvas respeita `devicePixelRatio` para renderização nítida e usa `fontScale`/`lineWidthScale` para acessibilidade.
- Listeners de eventos na maioria dos inputs chamam `refresh()` diretamente, enquanto ações específicas do NH (`generateGeometry`, `calculateNonHomogeneous`) são acionadas por seus próprios botões.
- A global `result` armazena o cálculo homogêneo; `nhGeometry` armazena a geometria e os resultados não homogêneos.

---

*Gerado a partir do código-fonte do RheoFlowDemo. Os valores são mostrados em SI dentro das equações e podem ser exibidos no sistema de unidades escolhido pelo usuário no painel.*