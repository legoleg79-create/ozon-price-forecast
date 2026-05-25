const tariffs = window.OZON_TARIFFS;
const pairSep = "\u0001";

const defaults = {
  cost: 252,
  price: 222,
  buyerMinPrice: 171,
  priceMin: 50,
  commissionRate: 40,
  orderFeeRate: 20,
  acquiringRate: 1.9,
  dmvDelivery: 25,
  useProfitTax: true,
  profitTaxRate: 15,
  incomeTaxRate: 7,
  fromCluster: "Омск",
  toCluster: "Москва, МО и Дальние регионы",
  volumeManual: 0.09,
  width: "",
  height: "",
  length: "",
  logisticsMultiplier: 1.8,
  logisticsPriceRate: 4,
};

const state = { ...defaults };
const fields = [...document.querySelectorAll("[data-field]")];
const rowsEl = document.querySelector("#rows");
const canvas = document.querySelector("#profitChart");
const ctx = canvas.getContext("2d");

function rub(value) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function pct(value) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function numberValue(name) {
  const value = state[name];
  return value === "" || value == null ? 0 : Number(value);
}

function commissionRate(price) {
  if (price <= 100) return 0.14;
  if (price <= 300) return 0.2;
  return numberValue("commissionRate") / 100;
}

function calcVolume() {
  const width = numberValue("width");
  const height = numberValue("height");
  const length = numberValue("length");
  if (width > 0 && height > 0 && length > 0) {
    return (width * height * length) / 1000000;
  }
  return Math.max(0.001, numberValue("volumeManual"));
}

function bucketIndex(volume) {
  const idx = tariffs.volumeBuckets.findIndex((bucket) => {
    const maxOk = bucket.max == null ? true : volume <= bucket.max;
    return volume >= bucket.min && maxOk;
  });
  return idx === -1 ? tariffs.volumeBuckets.length - 1 : idx;
}

function deliveryFor(price) {
  const volume = calcVolume();
  const idx = bucketIndex(volume);
  const lowPrice = price <= 300;
  if (lowPrice) {
    return {
      value: tariffs.defaultLow[idx],
      bucket: tariffs.volumeBuckets[idx].label,
      source: "до 300 ₽",
    };
  }

  const key = `${state.fromCluster}${pairSep}${state.toCluster}`;
  const pair = tariffs.highByPair[key];
  return {
    value: pair ? pair[idx] : tariffs.defaultHigh[idx],
    bucket: tariffs.volumeBuckets[idx].label,
    source: pair ? "по кластерам" : "тариф по умолчанию",
  };
}

function buyerPriceFor(price) {
  const basePrice = Math.max(1, numberValue("price"));
  const discountRate = Math.max(0, 1 - numberValue("buyerMinPrice") / basePrice);
  return price * (1 - discountRate);
}

function calc(price) {
  const commission = price * commissionRate(price);
  const buyerPrice = buyerPriceFor(price);
  const acquiring = buyerPrice * (numberValue("acquiringRate") / 100);
  const orderFee = price * (numberValue("orderFeeRate") / 100);
  const delivery = deliveryFor(price);
  const deliveryTo = delivery.value * numberValue("logisticsMultiplier") + price * (numberValue("logisticsPriceRate") / 100);
  const baseCosts = commission + acquiring + orderFee + delivery.value + numberValue("dmvDelivery");
  const stressCosts = commission + acquiring + orderFee + deliveryTo + numberValue("dmvDelivery");
  const profitBeforeTax = price - baseCosts - numberValue("cost");
  const stressBeforeTax = price - stressCosts - numberValue("cost");
  const tax = state.useProfitTax
    ? Math.max(0, profitBeforeTax) * (numberValue("profitTaxRate") / 100)
    : buyerPrice * (numberValue("incomeTaxRate") / 100);
  const stressTax = state.useProfitTax
    ? Math.max(0, stressBeforeTax) * (numberValue("profitTaxRate") / 100)
    : buyerPrice * (numberValue("incomeTaxRate") / 100);
  const profit = profitBeforeTax - tax;
  const profitTo = stressBeforeTax - stressTax;
  const cost = Math.max(1, numberValue("cost"));

  return {
    price,
    commissionRate: commissionRate(price),
    commission,
    acquiring,
    orderFee,
    delivery: delivery.value,
    deliveryTo,
    deliveryBucket: delivery.bucket,
    deliverySource: delivery.source,
    dmv: numberValue("dmvDelivery"),
    totalCosts: baseCosts,
    totalCostsTo: stressCosts,
    profit,
    profitTo,
    roi: (profit / cost) * 100,
    roiTo: (profitTo / cost) * 100,
  };
}

function priceStep(min, max) {
  const span = Math.max(1, max - min);
  if (span <= 800) return 5;
  if (span <= 2500) return 25;
  return 100;
}

function buildPriceRows() {
  const selected = numberValue("price");
  const min = Math.max(0, Math.min(numberValue("priceMin"), selected));
  const max = selected + Math.max(selected * 0.5, 500);
  const step = priceStep(min, max);
  const prices = [];

  for (let price = min; price <= max; price += step) prices.push(price);
  [100, 300, selected].forEach((price) => {
    if (price >= min && price <= max && !prices.includes(price)) prices.push(price);
  });

  return prices.sort((a, b) => a - b).map(calc);
}

function signedClass(value) {
  return value >= 0 ? "positive" : "negative";
}

function renderTable(results) {
  const selected = numberValue("price");
  rowsEl.innerHTML = results.map((row) => {
    const classes = [
      row.price === selected ? "selected" : "",
      row.price === 100 ? "price-100" : "",
    ].filter(Boolean).join(" ");
    return `<tr class="${classes}">
      <td>${rub(row.price)}</td>
      <td>${pct(row.commissionRate * 100)}</td>
      <td class="${signedClass(row.profit)}">${rub(row.profit)}</td>
      <td class="${signedClass(row.profitTo)}">${rub(row.profitTo)}</td>
      <td>${rub(row.commission)}</td>
      <td>${rub(row.acquiring)}</td>
      <td>${rub(row.orderFee)}</td>
      <td>${rub(row.delivery)}</td>
      <td>${rub(row.dmv)}</td>
      <td class="${signedClass(row.roi)}">${pct(row.roi)}</td>
      <td class="${signedClass(row.roiTo)}">${pct(row.roiTo)}</td>
    </tr>`;
  }).join("");
}

function renderKpis(results) {
  const current = calc(numberValue("price"));
  const best = results.reduce((a, b) => (b.profit > a.profit ? b : a), results[0] || current);
  document.querySelector("#profitNow").textContent = rub(current.profit);
  document.querySelector("#profitNow").className = signedClass(current.profit);
  document.querySelector("#roiNow").textContent = pct(current.roi);
  document.querySelector("#deliveryNow").textContent = `${rub(current.delivery)} · ${current.deliveryBucket}`;
  document.querySelector("#bestPrice").textContent = `${rub(best.price)} · ${rub(best.profit)}`;
}

function drawChart(results) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(600, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(320 * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = 320;
  const pad = { left: 58, right: 18, top: 18, bottom: 38 };
  const xs = results.map((r) => r.price);
  const ys = results.map((r) => r.profit);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, 0);
  const yRange = yMax - yMin || 1;
  const xRange = xMax - xMin || 1;
  const x = (value) => pad.left + ((value - xMin) / xRange) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - ((value - yMin) / yRange)) * (height - pad.top - pad.bottom);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#dce2dd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const yy = pad.top + ((height - pad.top - pad.bottom) / 4) * i;
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(width - pad.right, yy);
  }
  ctx.stroke();

  const zeroY = y(0);
  ctx.strokeStyle = "#879096";
  ctx.beginPath();
  ctx.moveTo(pad.left, zeroY);
  ctx.lineTo(width - pad.right, zeroY);
  ctx.stroke();

  ctx.strokeStyle = "#217a68";
  ctx.lineWidth = 3;
  ctx.beginPath();
  results.forEach((row, idx) => {
    const px = x(row.price);
    const py = y(row.profit);
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  const current = calc(numberValue("price"));
  ctx.fillStyle = "#b4532a";
  ctx.beginPath();
  ctx.arc(x(current.price), y(current.profit), 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5d686d";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(rub(yMax), pad.left - 8, pad.top + 4);
  ctx.fillText(rub(0), pad.left - 8, zeroY + 4);
  ctx.fillText(rub(yMin), pad.left - 8, height - pad.bottom);
  ctx.textAlign = "left";
  ctx.fillText(rub(xMin), pad.left, height - 12);
  ctx.textAlign = "right";
  ctx.fillText(rub(xMax), width - pad.right, height - 12);
}

function render() {
  const results = buildPriceRows();
  renderKpis(results);
  renderTable(results);
  drawChart(results);
}

function syncFields() {
  fields.forEach((field) => {
    const name = field.dataset.field;
    if (field.type === "checkbox") field.checked = Boolean(state[name]);
    else field.value = state[name];
  });
}

function fillSelects() {
  const from = document.querySelector('[data-field="fromCluster"]');
  const to = document.querySelector('[data-field="toCluster"]');
  from.innerHTML = tariffs.fromClusters.map((value) => `<option value="${value}">${value}</option>`).join("");
  to.innerHTML = tariffs.toClusters.map((value) => `<option value="${value}">${value}</option>`).join("");
}

fields.forEach((field) => {
  field.addEventListener("input", () => {
    const name = field.dataset.field;
    state[name] = field.type === "checkbox" ? field.checked : field.value;
    render();
  });
});

document.querySelector("#resetBtn").addEventListener("click", () => {
  Object.assign(state, defaults);
  syncFields();
  render();
});

window.addEventListener("resize", () => drawChart(buildPriceRows()));

fillSelects();
syncFields();
render();
