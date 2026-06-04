'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  currentTab: 'memory',
  reports: {
    memory: null,
    division: null,
    booth: null,
    utils: null
  }
};

const unitName = value => ({ '1': 'direcciones', '1024': 'K', '1048576': 'M', '1073741824': 'G' }[String(value)] || '');
const formatNumber = value => Number(value).toLocaleString('es-ES');
const stripHex = value => String(value || '0').trim().replace(/^0x/i, '') || '0';

function parseBinary(input, label = 'binario') {
  const cleaned = String(input).replace(/[\s,;_]/g, '');
  if (!cleaned || /[^01]/.test(cleaned)) throw new Error(`${label} debe contener solo 0 y 1.`);
  return cleaned.split('').map(Number);
}

function bitsToString(bits) { return bits.join(''); }
function cloneBits(bits) { return bits.slice(); }
function pow2(bits) { return 1n << BigInt(bits); }

function unsignedBitsToBigInt(bits) {
  return BigInt('0b' + bitsToString(bits));
}

function signedBitsToBigInt(bits) {
  const unsigned = unsignedBitsToBigInt(bits);
  if (bits[0] === 1) return unsigned - pow2(bits.length);
  return unsigned;
}

function bigIntToUnsignedBits(value, width) {
  let mod = pow2(width);
  let normalized = ((BigInt(value) % mod) + mod) % mod;
  return normalized.toString(2).padStart(width, '0').slice(-width).split('').map(Number);
}

function bigIntToSignedBits(value, width) {
  const min = -(1n << BigInt(width - 1));
  const max = (1n << BigInt(width - 1)) - 1n;
  const v = BigInt(value);
  if (v < min || v > max) throw new Error(`El valor ${v} no cabe en ${width} bits con signo. Rango: ${min} a ${max}.`);
  return bigIntToUnsignedBits(v, width);
}

function fitBits(bits, width) {
  if (bits.length === width) return cloneBits(bits);
  if (bits.length < width) return Array(width - bits.length).fill(0).concat(bits);
  return bits.slice(bits.length - width);
}

function signExtend(bits, width) {
  if (bits.length === width) return cloneBits(bits);
  const sign = bits[0] || 0;
  if (bits.length < width) return Array(width - bits.length).fill(sign).concat(bits);
  return bits.slice(bits.length - width);
}

function opBin(bits) { return bigIntToUnsignedBits(-signedBitsToBigInt(bits), bits.length); }
function sumaBin(A, B, width = Math.max(A.length, B.length)) { return bigIntToUnsignedBits(unsignedBitsToBigInt(fitBits(A, width)) + unsignedBitsToBigInt(fitBits(B, width)), width); }
function restaBin(A, B, width = Math.max(A.length, B.length)) { return bigIntToUnsignedBits(unsignedBitsToBigInt(fitBits(A, width)) - unsignedBitsToBigInt(fitBits(B, width)), width); }
function despIzq(bits) { return bits.slice(1).concat(0); }
function despDer(bits) { return [0].concat(bits.slice(0, -1)); }
function arithRight(bits) { return [bits[0]].concat(bits.slice(0, -1)); }
function splitHalf(bits) { const n = bits.length / 2; return [bits.slice(0, n), bits.slice(n)]; }

function minSignedBits(...values) {
  let bits = 2;
  const bigintValues = values.map(BigInt);
  while (true) {
    const min = -(1n << BigInt(bits - 1));
    const max = (1n << BigInt(bits - 1)) - 1n;
    if (bigintValues.every(v => v >= min && v <= max)) return bits;
    bits++;
  }
}

function htmlEscape(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[ch]));
}

function summary(items) {
  return `<div class="summary-grid">${items.map(([label, value]) => `<div class="summary-item"><span>${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></div>`).join('')}</div>`;
}

function table(headers, rows) {
  return `<div class="table-wrap"><table class="ec-table"><thead><tr>${headers.map(h => `<th>${htmlEscape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderError(target, error) {
  $(target).innerHTML = `<div class="error-box">${htmlEscape(error.message || error)}</div>`;
}

function setTab(tab) {
  state.currentTab = tab;
  $$('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  $$('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === tab));
  $('#mobileMenu').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function addChipRow(amount = 64, unit = 1024, count = 1) {
  const tpl = $('#chipRowTemplate').content.cloneNode(true);
  const row = tpl.querySelector('.chip-row');
  $('.chip-amount', row).value = amount;
  $('.chip-unit', row).value = String(unit);
  $('.chip-count', row).value = count;
  $('.remove-chip', row).addEventListener('click', () => {
    if ($$('.chip-row', $('#chipsList')).length > 1) row.remove();
  });
  $('#chipsList').appendChild(row);
}

function getMemoryInputs() {
  const amount = Number($('#memAmount').value);
  const unit = BigInt($('#memUnit').value);
  const width = Number($('#memWidth').value);
  const startHex = stripHex($('#memStart').value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('La capacidad total debe ser mayor que 0.');
  if (!Number.isInteger(width) || width <= 0) throw new Error('El ancho de palabra debe ser un entero positivo.');
  if (!/^[0-9a-fA-F]+$/.test(startHex)) throw new Error('La dirección inicial debe estar en hexadecimal.');
  const total = BigInt(amount) * unit;
  const start = BigInt('0x' + startHex);
  const chips = [];
  $$('.chip-row', $('#chipsList')).forEach((row, idx) => {
    const chipAmount = Number($('.chip-amount', row).value);
    const chipUnit = BigInt($('.chip-unit', row).value);
    const chipCount = Number($('.chip-count', row).value);
    if (!Number.isFinite(chipAmount) || chipAmount <= 0) throw new Error(`La capacidad del chip ${idx + 1} no es válida.`);
    if (!Number.isInteger(chipCount) || chipCount <= 0) throw new Error(`La cantidad del chip ${idx + 1} no es válida.`);
    for (let i = 0; i < chipCount; i++) chips.push({ size: BigInt(chipAmount) * chipUnit, label: `${chipAmount}${unitName(chipUnit.toString())}` });
  });
  if (!chips.length) throw new Error('Debe existir al menos un chip.');
  return { amount, unit, width, total, start, startHex: startHex.toUpperCase(), chips };
}

function hexPad(value, digits) {
  return BigInt(value).toString(16).toUpperCase().padStart(digits, '0');
}

function binPad(value, width) {
  return BigInt(value).toString(2).padStart(width, '0');
}

function calculateMemory() {
  const input = getMemoryInputs();
  const end = input.start + input.total - 1n;
  const hexDigits = Math.max(hexPad(end, 1).length, input.startHex.length);
  const binWidth = Math.max(4 * hexDigits, 1);
  let cursor = input.start;
  const rows = input.chips.map((chip, idx) => {
    const initial = cursor;
    const final = cursor + chip.size - 1n;
    cursor = final + 1n;
    return {
      chip: idx + 1,
      type: chip.label,
      capacity: chip.size,
      initial,
      final,
      initialHex: hexPad(initial, hexDigits),
      finalHex: hexPad(final, hexDigits),
      initialBin: binPad(initial, binWidth),
      finalBin: binPad(final, binWidth)
    };
  });
  const totalChipCapacity = input.chips.reduce((acc, chip) => acc + chip.size, 0n);
  const ok = totalChipCapacity === input.total;
  const steps = [
    `Memoria total: ${input.amount}${unitName(input.unit.toString())} × ${input.width} = ${formatNumber(input.total)} direcciones de ${input.width} bits.`,
    `Dirección final total = dirección inicial + tamaño total - 1 = ${hexPad(input.start, hexDigits)} + ${hexPad(input.total, hexDigits)} - 1 = ${hexPad(end, hexDigits)}.`,
    `Cada chip se coloca de forma consecutiva: inicio del chip actual = final del chip anterior + 1.`
  ];
  if (!ok) steps.push(`Aviso: la capacidad total de chips es ${formatNumber(totalChipCapacity)}, pero la memoria solicitada es ${formatNumber(input.total)}. El mapeo se muestra igualmente.`);
  return { title: 'Mapeo de memoria', input, end, hexDigits, binWidth, rows, steps, ok };
}

function renderMemory() {
  try {
    const res = calculateMemory();
    state.reports.memory = res;
    const rows = res.rows.map(r => [
      htmlEscape(r.chip),
      htmlEscape(r.type),
      htmlEscape(formatNumber(r.capacity)),
      `<span class="bin">${r.initialHex}</span>`,
      `<span class="bin">${r.finalHex}</span>`,
      `<span class="bin">${r.initialBin}</span>`,
      `<span class="bin">${r.finalBin}</span>`
    ]);
    $('#memoryOutput').innerHTML = `
      ${summary([
        ['Dirección inicial', res.rows[0]?.initialHex || '—'],
        ['Dirección final', hexPad(res.end, res.hexDigits)],
        ['Bloques/chips', String(res.rows.length)],
        ['Estado', res.ok ? 'Capacidad exacta' : 'Revisar capacidades']
      ])}
      <div class="mt-5 step-box"><strong>Paso clave:</strong> ${htmlEscape(res.steps[1])}</div>
      <div class="mt-5">${table(['Chip', 'Tipo', 'Capacidad', 'Inicial HEX', 'Final HEX', 'Inicial BIN', 'Final BIN'], rows)}</div>
    `;
  } catch (err) { state.reports.memory = null; renderError('#memoryOutput', err); }
}

function calculateDivision() {
  const dividendRaw = parseBinary($('#divDividend').value, 'El dividendo');
  const divisorRaw = parseBinary($('#divDivisor').value, 'El divisor');
  if (unsignedBitsToBigInt(divisorRaw) === 0n) throw new Error('El divisor no puede ser 0.');
  const bitsMode = $('#divBitsMode').value;
  const n = bitsMode === 'custom' ? Number($('#divCustomBits').value) : Math.max(dividendRaw.length, divisorRaw.length);
  if (!Number.isInteger(n) || n < 2) throw new Error('El número de bits debe ser un entero mayor o igual que 2.');
  let M = fitBits(divisorRaw, n);
  let Q = fitBits(dividendRaw, n);
  let A = Array(n).fill(0);
  const rows = [];
  const push = (it, action) => rows.push({ it, A: bitsToString(A), Q: bitsToString(Q), M: bitsToString(M), action, Adec: signedBitsToBigInt(A).toString() });
  push(0, 'Valores iniciales');
  A = opBin(M);
  push(0, 'Dividendo - divisor: A = -M');
  for (let count = 0; count < n; count++) {
    const it = count + 1;
    const beforeNegative = signedBitsToBigInt(A) < 0n;
    let joined = A.concat(Q);
    joined = despIzq(joined);
    [A, Q] = splitHalf(joined);
    push(it, 'Desplazamiento izquierda de A,Q');
    if (beforeNegative) {
      A = sumaBin(A, M, n);
      push(it, 'A era negativo antes del desplazamiento: A = A + M');
    } else {
      A = restaBin(A, M, n);
      push(it, 'A era no negativo antes del desplazamiento: A = A - M');
    }
    if (signedBitsToBigInt(A) < 0n) {
      Q[Q.length - 1] = 0;
      push(it, 'A < 0 ⇒ Q₀ = 0');
    } else {
      Q[Q.length - 1] = 1;
      push(it, 'A ≥ 0 ⇒ Q₀ = 1');
    }
  }
  if (signedBitsToBigInt(A) < 0n) {
    A = sumaBin(A, M, n);
    push(n, 'Corrección final: A < 0 ⇒ A = A + M');
  }
  const quotient = unsignedBitsToBigInt(Q);
  const remainder = signedBitsToBigInt(A);
  const dividend = unsignedBitsToBigInt(fitBits(dividendRaw, n));
  const divisor = unsignedBitsToBigInt(fitBits(divisorRaw, n));
  const classicalQuotient = dividend / divisor;
  const classicalRemainder = dividend % divisor;
  const steps = [
    `Se normalizan dividendo y divisor a ${n} bits.`,
    `Se inicializan A = 0, Q = dividendo y M = divisor.`,
    `Siguiendo el MATLAB original, se añade una fila inicial con A = -M.`,
    `En cada iteración se desplaza A,Q a la izquierda; según el signo previo de A se suma o resta M; finalmente se escribe Q₀.`
  ];
  return { title: 'División sin restauración', input: { dividend: bitsToString(dividendRaw), divisor: bitsToString(divisorRaw), bits: n }, rows, quotient, remainder, classicalQuotient, classicalRemainder, steps };
}

function renderDivision() {
  try {
    const res = calculateDivision();
    state.reports.division = res;
    const rows = res.rows.map(r => [htmlEscape(r.it), `<span class="bin">${r.A}</span>`, `<span class="bin">${r.Q}</span>`, `<span class="bin">${r.M}</span>`, htmlEscape(r.Adec), htmlEscape(r.action)]);
    $('#divisionOutput').innerHTML = `
      ${summary([
        ['Cociente Q', `${res.quotient} (${res.rows.at(-1).Q})`],
        ['Resto A', `${res.remainder} (${res.rows.at(-1).A})`],
        ['Comprobación aritmética', `${res.classicalQuotient} resto ${res.classicalRemainder}`],
        ['Bits', String(res.input.bits)]
      ])}
      <div class="mt-5 step-box"><strong>Nota:</strong> se muestra el resultado de la traza portada desde MATLAB y, al lado, la comprobación decimal clásica del dividendo/divisor introducidos.</div>
      <div class="mt-5">${table(['Iteración', 'A', 'Q', 'M', 'A decimal', 'Acción'], rows)}</div>
    `;
  } catch (err) { state.reports.division = null; renderError('#divisionOutput', err); }
}

function calculateBooth() {
  const multiplicand = BigInt($('#boothM').value || 0);
  const multiplier = BigInt($('#boothQ').value || 0);
  const bitsMode = $('#boothBitsMode').value;
  const n = bitsMode === 'custom' ? Number($('#boothCustomBits').value) : minSignedBits(multiplicand, multiplier);
  if (!Number.isInteger(n) || n < 2) throw new Error('El número de bits debe ser un entero mayor o igual que 2.');
  const M = bigIntToSignedBits(multiplicand, n);
  let A = Array(n).fill(0);
  let Q = bigIntToSignedBits(multiplier, n);
  let Qm1 = 0;
  const rows = [];
  const push = (it, action) => rows.push({ it, A: bitsToString(A), Q: bitsToString(Q), Qm1, M: bitsToString(M), action, Adec: signedBitsToBigInt(A).toString(), Qdec: signedBitsToBigInt(Q).toString() });
  push(0, 'Valores iniciales');
  for (let i = 1; i <= n; i++) {
    const q0 = Q[Q.length - 1];
    if (q0 === 1 && Qm1 === 0) {
      A = bigIntToUnsignedBits(signedBitsToBigInt(A) - signedBitsToBigInt(M), n);
      push(i, 'Q₀Q₋₁ = 10 ⇒ A = A - M');
    } else if (q0 === 0 && Qm1 === 1) {
      A = bigIntToUnsignedBits(signedBitsToBigInt(A) + signedBitsToBigInt(M), n);
      push(i, 'Q₀Q₋₁ = 01 ⇒ A = A + M');
    } else {
      push(i, `Q₀Q₋₁ = ${q0}${Qm1} ⇒ sin operación`);
    }
    const combined = A.concat(Q, [Qm1]);
    const shifted = arithRight(combined);
    A = shifted.slice(0, n);
    Q = shifted.slice(n, 2 * n);
    Qm1 = shifted[2 * n];
    push(i, 'Desplazamiento aritmético derecha de A,Q,Q₋₁');
  }
  const productBits = A.concat(Q);
  const product = signedBitsToBigInt(productBits);
  const expected = multiplicand * multiplier;
  const steps = [
    `Se representan M=${multiplicand} y Q=${multiplier} en complemento a dos con ${n} bits.`,
    `Se inicializa A=0 y Q₋₁=0.`,
    `Durante ${n} iteraciones se analiza Q₀Q₋₁, se suma/resta M si procede y después se desplaza aritméticamente.`,
    `El producto final es la concatenación A,Q: ${bitsToString(productBits)}.`
  ];
  return { title: 'Multiplicación por Booth', input: { multiplicand: multiplicand.toString(), multiplier: multiplier.toString(), bits: n }, rows, productBits: bitsToString(productBits), product, expected, steps };
}

function renderBooth() {
  try {
    const res = calculateBooth();
    state.reports.booth = res;
    const rows = res.rows.map(r => [htmlEscape(r.it), `<span class="bin">${r.A}</span>`, `<span class="bin">${r.Q}</span>`, `<span class="bin">${r.Qm1}</span>`, `<span class="bin">${r.M}</span>`, htmlEscape(r.action)]);
    $('#boothOutput').innerHTML = `
      ${summary([
        ['Producto binario', res.productBits],
        ['Producto decimal', res.product.toString()],
        ['Comprobación', res.expected.toString()],
        ['Bits por registro', String(res.input.bits)]
      ])}
      <div class="mt-5">${table(['Iteración', 'A', 'Q', 'Q₋₁', 'M', 'Acción'], rows)}</div>
    `;
  } catch (err) { state.reports.booth = null; renderError('#boothOutput', err); }
}

function refreshUtilVisibility() {
  const op = $('#utilOperation').value;
  $('#utilDecimalWrap').classList.toggle('hidden', op !== 'dec2bin');
  $('#utilBinaryAWrap').classList.toggle('hidden', !['bin2dec', 'sum', 'sub', 'opposite', 'shiftLeft', 'shiftRight', 'compare'].includes(op));
  $('#utilBinaryBWrap').classList.toggle('hidden', !['sum', 'sub', 'compare'].includes(op));
  $('#utilCompareWrap').classList.toggle('hidden', op !== 'compare');
}

function calculateUtils() {
  const op = $('#utilOperation').value;
  const bits = Number($('#utilBits').value);
  if (!Number.isInteger(bits) || bits < 1) throw new Error('Los bits de salida deben ser un entero positivo.');
  let result, rows = [], steps = [], input = { operation: op, bits };
  if (op === 'dec2bin') {
    const dec = BigInt($('#utilDecimal').value || 0);
    const bin = bigIntToSignedBits(dec, Math.max(bits, minSignedBits(dec)));
    result = bitsToString(bin);
    input.decimal = dec.toString();
    steps = [`Se toma el decimal ${dec}.`, `Se representa en complemento a dos usando ${bin.length} bits.`];
    rows = [['Decimal', dec.toString()], ['Binario', result]];
  } else {
    const Araw = parseBinary($('#utilBinaryA').value, 'Binario A');
    const A = fitBits(Araw, bits);
    input.A = bitsToString(Araw);
    if (op === 'bin2dec') {
      result = signedBitsToBigInt(A).toString();
      steps = [`Se interpreta ${bitsToString(A)} como complemento a dos.`, `El bit de signo es ${A[0]}.`];
      rows = [['Binario normalizado', bitsToString(A)], ['Decimal', result]];
    } else if (op === 'opposite') {
      const res = opBin(A);
      result = bitsToString(res);
      steps = ['Se invierten los bits y se suma 1.', 'Eso equivale a cambiar el signo en complemento a dos.'];
      rows = [['A', bitsToString(A)], ['Opuesto', result], ['Decimal opuesto', signedBitsToBigInt(res).toString()]];
    } else if (op === 'shiftLeft') {
      const res = despIzq(A);
      result = bitsToString(res);
      steps = ['Se elimina el bit más significativo y entra un 0 por la derecha.'];
      rows = [['A', bitsToString(A)], ['A << 1', result]];
    } else if (op === 'shiftRight') {
      const res = despDer(A);
      result = bitsToString(res);
      steps = ['Desplazamiento lógico: entra un 0 por la izquierda y se pierde el último bit.'];
      rows = [['A', bitsToString(A)], ['A >> 1', result]];
    } else {
      const Braw = parseBinary($('#utilBinaryB').value, 'Binario B');
      const B = fitBits(Braw, bits);
      input.B = bitsToString(Braw);
      if (op === 'sum') {
        const res = sumaBin(A, B, bits);
        result = bitsToString(res);
        steps = ['Se normalizan A y B al mismo número de bits.', 'Se suma módulo 2ⁿ, igual que una ALU de anchura fija.'];
        rows = [['A', bitsToString(A)], ['B', bitsToString(B)], ['A + B', result], ['Decimal firmado', signedBitsToBigInt(res).toString()]];
      } else if (op === 'sub') {
        const res = restaBin(A, B, bits);
        result = bitsToString(res);
        steps = ['Se normalizan A y B.', 'Se calcula A - B módulo 2ⁿ.'];
        rows = [['A', bitsToString(A)], ['B', bitsToString(B)], ['A - B', result], ['Decimal firmado', signedBitsToBigInt(res).toString()]];
      } else if (op === 'compare') {
        const cmp = $('#utilCompare').value;
        const aDec = signedBitsToBigInt(A);
        const bDec = signedBitsToBigInt(B);
        const map = {
          '>': aDec > bDec,
          '>=': aDec >= bDec,
          '==': aDec === bDec,
          '<': aDec < bDec,
          '<=': aDec <= bDec,
          major: aDec >= bDec ? bitsToString(A) : bitsToString(B),
          minor: aDec <= bDec ? bitsToString(A) : bitsToString(B)
        };
        result = String(map[cmp]);
        steps = ['Se convierten ambos binarios a decimal firmado.', `Se aplica la comparación ${cmp}.`];
        rows = [['A', `${bitsToString(A)} = ${aDec}`], ['B', `${bitsToString(B)} = ${bDec}`], ['Resultado', result]];
      }
    }
  }
  return { title: 'Utilidades binarias', input, rows, result, steps };
}

function renderUtils() {
  try {
    const res = calculateUtils();
    state.reports.utils = res;
    $('#utilsOutput').innerHTML = `
      ${summary([['Resultado', res.result], ['Operación', $('#utilOperation option:checked').text()], ['Bits', String(res.input.bits)]])}
      <div class="mt-5 step-box">${res.steps.map(s => `<p>${htmlEscape(s)}</p>`).join('')}</div>
      <div class="mt-5">${table(['Campo', 'Valor'], res.rows.map(r => [htmlEscape(r[0]), `<span class="bin">${htmlEscape(r[1])}</span>`]))}</div>
    `;
  } catch (err) { state.reports.utils = null; renderError('#utilsOutput', err); }
}

function getReport(tab) {
  if (!state.reports[tab]) {
    if (tab === 'memory') renderMemory();
    if (tab === 'division') renderDivision();
    if (tab === 'booth') renderBooth();
    if (tab === 'utils') renderUtils();
  }
  return state.reports[tab];
}

function rowsForPdf(report, tab) {
  if (tab === 'memory') return {
    head: [['Chip', 'Tipo', 'Capacidad', 'Inicial HEX', 'Final HEX', 'Inicial BIN', 'Final BIN']],
    body: report.rows.map(r => [String(r.chip), r.type, String(r.capacity), r.initialHex, r.finalHex, r.initialBin, r.finalBin])
  };
  if (tab === 'division') return {
    head: [['Iteración', 'A', 'Q', 'M', 'A decimal', 'Acción']],
    body: report.rows.map(r => [String(r.it), r.A, r.Q, r.M, r.Adec, r.action])
  };
  if (tab === 'booth') return {
    head: [['Iteración', 'A', 'Q', 'Q-1', 'M', 'Acción']],
    body: report.rows.map(r => [String(r.it), r.A, r.Q, String(r.Qm1), r.M, r.action])
  };
  return {
    head: [['Campo', 'Valor']],
    body: report.rows.map(r => [String(r[0]), String(r[1])])
  };
}

function inputForPdf(report, tab) {
  if (tab === 'memory') {
    return [
      ['Capacidad total', `${report.input.amount}${unitName(report.input.unit.toString())}`],
      ['Ancho de palabra', `${report.input.width}`],
      ['Dirección inicial', report.input.startHex],
      ['Dirección final', hexPad(report.end, report.hexDigits)],
      ['Número de chips', String(report.rows.length)]
    ];
  }
  if (tab === 'division') return [['Dividendo', report.input.dividend], ['Divisor', report.input.divisor], ['Bits', String(report.input.bits)], ['Cociente final Q', String(report.quotient)], ['Resto final A', String(report.remainder)]];
  if (tab === 'booth') return [['Multiplicando', report.input.multiplicand], ['Multiplicador', report.input.multiplier], ['Bits por registro', String(report.input.bits)], ['Producto binario', report.productBits], ['Producto decimal', String(report.product)]];
  return Object.entries(report.input).map(([k, v]) => [k, String(v)]).concat([['Resultado', String(report.result)]]);
}

function downloadPdf(tab) {
  const report = getReport(tab);
  if (!report) return alert('No hay resultados válidos para exportar.');
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return alert('No se ha podido cargar jsPDF. Comprueba la conexión a internet o descarga las librerías localmente.');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 36;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(report.title, margin, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generado por EC Web Calculator · ${new Date().toLocaleString('es-ES')}`, margin, 60);

  doc.autoTable({
    startY: 82,
    head: [['Dato de entrada / resultado', 'Valor']],
    body: inputForPdf(report, tab),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: margin, right: margin }
  });

  let y = doc.lastAutoTable.finalY + 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Pasos de cálculo', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const steps = report.steps || [];
  steps.forEach((step, idx) => {
    const lines = doc.splitTextToSize(`${idx + 1}. ${step}`, 760);
    doc.text(lines, margin, y);
    y += lines.length * 11 + 4;
    if (y > 510) { doc.addPage(); y = 42; }
  });

  const pdfRows = rowsForPdf(report, tab);
  doc.autoTable({
    startY: y + 8,
    head: pdfRows.head,
    body: pdfRows.body,
    styles: { font: 'helvetica', fontSize: tab === 'memory' ? 6.5 : 7.5, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 23, 42] },
    margin: { left: margin, right: margin }
  });
  doc.save(`ec-${tab}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function boot() {
  $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  $$('[data-tab-shortcut]').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tabShortcut)));
  $('#mobileMenuBtn').addEventListener('click', () => $('#mobileMenu').classList.toggle('hidden'));
  $('#downloadCurrentPdf').addEventListener('click', () => downloadPdf(state.currentTab));
  $$('[data-pdf]').forEach(btn => btn.addEventListener('click', () => downloadPdf(btn.dataset.pdf)));

  $('#addChip').addEventListener('click', () => addChipRow());
  $('#memoryExample').addEventListener('click', () => {
    $('#memAmount').value = 2; $('#memUnit').value = '1048576'; $('#memWidth').value = 32; $('#memStart').value = '70000';
    $('#chipsList').innerHTML = ''; addChipRow(64, 1024, 6); addChipRow(32, 1024, 2); renderMemory();
  });
  $('#memoryForm').addEventListener('submit', e => { e.preventDefault(); renderMemory(); });

  $('#divBitsMode').addEventListener('change', () => $('#divCustomBitsWrap').classList.toggle('hidden', $('#divBitsMode').value !== 'custom'));
  $('#divisionExample').addEventListener('click', () => { $('#divDividend').value = '0111'; $('#divDivisor').value = '0011'; $('#divBitsMode').value = 'auto'; $('#divCustomBitsWrap').classList.add('hidden'); renderDivision(); });
  $('#divisionForm').addEventListener('submit', e => { e.preventDefault(); renderDivision(); });

  $('#boothBitsMode').addEventListener('change', () => $('#boothCustomBitsWrap').classList.toggle('hidden', $('#boothBitsMode').value !== 'custom'));
  $('#boothExample').addEventListener('click', () => { $('#boothM').value = -3; $('#boothQ').value = 5; $('#boothBitsMode').value = 'auto'; $('#boothCustomBitsWrap').classList.add('hidden'); renderBooth(); });
  $('#boothForm').addEventListener('submit', e => { e.preventDefault(); renderBooth(); });

  $('#utilOperation').addEventListener('change', refreshUtilVisibility);
  $('#utilsForm').addEventListener('submit', e => { e.preventDefault(); renderUtils(); });

  addChipRow(64, 1024, 6);
  addChipRow(32, 1024, 2);
  refreshUtilVisibility();
  renderMemory();
  renderDivision();
  renderBooth();
  renderUtils();
}

document.addEventListener('DOMContentLoaded', boot);
