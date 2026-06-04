# EC Web Calculator

Proyecto web estático que porta a HTML + CSS + JavaScript los scripts MATLAB del repositorio `Estructura-de-los-Computadores`.

## Qué permite hacer

- Mapear memoria a partir de capacidad total, dirección inicial y chips disponibles.
- Ejecutar la división sin restauración siguiendo la traza del script MATLAB original.
- Ejecutar multiplicación por Booth con complemento a dos. En el repositorio original esta función estaba marcada como no terminada, por lo que aquí se incluye una implementación completa.
- Usar utilidades binarias: decimal/binario, binario/decimal, complemento a dos, suma, resta, desplazamientos y comparación.
- Descargar un PDF con datos de entrada, resultados y pasos de cálculo.

## Cómo usarlo

Abre `index.html` directamente en el navegador.

La web utiliza TailwindCSS, jsPDF y jsPDF AutoTable desde CDN, por lo que para estilos y PDF se necesita conexión a internet. Si se quiere usar completamente offline, descarga esas librerías y cambia los enlaces del `index.html` a rutas locales.

## Estructura

```text
index.html
assets/
  css/
    styles.css
  js/
    app.js
```

## Notas de implementación

- Se usa `BigInt` para evitar errores de precisión en direcciones de memoria y operaciones binarias grandes.
- El mapeo de memoria usa direcciones consecutivas, igual que `mapearMemoria.m`.
- La división muestra la tabla de registros `A`, `Q`, `M`, iteración y acción.
- La multiplicación Booth se ha completado usando el algoritmo estándar con registros `A`, `Q`, `Q-1` y desplazamiento aritmético.
