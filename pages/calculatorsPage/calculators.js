(() => {
  'use strict';

  const CALCULATOR_CONFIG = Object.freeze({
    retirement: {
      inflationAnnual: 0.05,
      realReturns: { moderate: 0.035 },
      retirementAge: 65,
      maxMonthlyContribution: 500000
    },
    living: {
      inflationAnnual: 0.05,
      marketReturns: { average: 0.07, good: 0.09 },
      minDrawdown: 0.025,
      maxDrawdown: 0.175,
      defaultDrawdown: 0.045,
      maxIllustratedYears: 60
    }
  });

  function compoundMonthlyBalance(startBalance, monthlyRate, months) {
    return Math.max(0, startBalance * Math.pow(1 + monthlyRate, months));
  }

  function monthlyNominalRate(annualNominalRate) {
    return Math.pow(1 + annualNominalRate, 1 / 12) - 1;
  }

  function monthlyInflationRate(inflationAnnual) {
    return Math.pow(1 + inflationAnnual, 1 / 12) - 1;
  }

  function projectRetirementAnnuity({ age, monthlyContribution, existingSavings = 0, strategy = 'moderate' }) {
    const { inflationAnnual, realReturns, retirementAge } = CALCULATOR_CONFIG.retirement;
    const realReturn = realReturns[strategy] ?? realReturns.moderate;
    const nominalReturn = (1 + inflationAnnual) * (1 + realReturn) - 1;
    const monthlyReturn = monthlyNominalRate(nominalReturn);
    const monthlyInflation = monthlyInflationRate(inflationAnnual);
    const months = Math.max(0, Math.floor((retirementAge - age) * 12));
    let balance = Math.max(0, existingSavings);
    let currentContribution = Math.max(0, monthlyContribution);
    let futureContributions = 0;
    const history = [{ age, balance }];

    for (let month = 1; month <= months; month += 1) {
      balance = balance * (1 + monthlyReturn);
      balance += currentContribution;
      futureContributions += currentContribution;
      if (month < months) {
        currentContribution *= (1 + monthlyInflation);
      }
      if (month % 12 === 0 || month === months) {
        history.push({ age: age + month / 12, balance });
      }
    }

    const investmentGrowth = Math.max(0, balance - existingSavings - futureContributions);
    const todaysValue = balance / Math.pow(1 + inflationAnnual, months / 12);
    return { totalValue: balance, todaysValue, existingSavings, futureContributions,
      totalContributions: existingSavings + futureContributions, investmentGrowth,
      yearsUntilRetirement: retirementAge - age, history, nominalReturn };
  }

  function projectLivingAnnuity({ capital, drawdownRate, annualReturn, inflation = CALCULATOR_CONFIG.living.inflationAnnual,
                                   maxYears = CALCULATOR_CONFIG.living.maxIllustratedYears }) {
    if (![capital, drawdownRate, annualReturn].every(Number.isFinite) || capital <= 0 || drawdownRate <= 0) {
      return { initialAnnualIncome: 0, initialMonthlyIncome: 0, balanceHistory: [], depleted: false, depletionYears: null, remainingCapital: 0 };
    }
    const initialAnnualIncome = capital * drawdownRate;
    const initialMonthlyIncome = initialAnnualIncome / 12;
    let monthlyIncome = initialMonthlyIncome;
    let balance = capital;
    let annualInflation = inflation;
    const monthlyReturn = monthlyNominalRate(annualReturn);
    const balanceHistory = [{ year: 0, balance }];
    let depletionYears = null;

    for (let year = 1; year <= maxYears && depletionYears === null; year += 1) {
      if (year > 1) monthlyIncome *= (1 + annualInflation);
      for (let month = 1; month <= 12; month += 1) {
        balance *= (1 + monthlyReturn);
        balance -= monthlyIncome;
        if (balance <= 0) {
          balance = 0;
          depletionYears = year - 1 + month / 12;
          break;
        }
      }
      balanceHistory.push({ year, balance });
    }

    return { initialAnnualIncome, initialMonthlyIncome, balanceHistory, depleted: depletionYears !== null,
      depletionYears, remainingCapital: balance };
  }

  function formatZAR(value) {
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(safeValue).replace('ZAR','R').replace(/\u00a0/g,' ').trim();
  }

  function parseMoney(value) {
    if (typeof value !== 'string') return Number.isFinite(value) ? value : 0;
    const cleaned = value.replace(/[^0-9.-]/g, '');
    return cleaned ? Number(cleaned) : 0;
  }

  function validationMessage(input, message) {
    const error = document.querySelector(`[data-error-for="${input.id}"]`);
    if (error) error.textContent = message || '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function bindMoneyInput(input) {
    input.addEventListener('blur', () => {
      const value = parseMoney(input.value);
      if (value > 0) input.value = formatZAR(value);
      else if (input.value.trim() === '') input.value = '';
    });
  }

  function drawLineChart(canvas, series, options = {}) {
    if (!canvas) return;
    canvas._vizionChartSeries = series;
    canvas._vizionChartOptions = options;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(300, rect.width * ratio);
    canvas.height = 280 * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const width = canvas.width / ratio;
    const height = canvas.height / ratio;
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 15, right: 18, bottom: 35, left: 72 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    let maxValue = 0;
    let maxX = 1;
    series.forEach(s => s.data.forEach(p => { maxValue = Math.max(maxValue, p.value); maxX = Math.max(maxX, p.age ?? p.year); }));
    maxValue = maxValue > 0 ? maxValue * 1.08 : 1;

    ctx.strokeStyle = '#DDD8D0'; ctx.fillStyle = '#777'; ctx.font = '11px Inter, sans-serif'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padding.top + plotHeight * i / 4;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
      const value = maxValue * (1 - i / 4);
      ctx.fillText(formatZAR(value).replace('.00',''), 4, y + 4);
    }

    const colors = options.colors || ['#C8A96A', '#1C252E'];
    series.forEach((s, index) => {
      ctx.strokeStyle = colors[index % colors.length]; ctx.lineWidth = 2.5; ctx.beginPath();
      s.data.forEach((point, pointIndex) => {
        const x = padding.left + ((point.age ?? point.year) / maxX) * plotWidth;
        const y = padding.top + plotHeight - (point.value / maxValue) * plotHeight;
        if (pointIndex === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    ctx.fillStyle = '#777'; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i += 1) {
      const x = padding.left + plotWidth * i / 4;
      const label = Math.round(maxX * i / 4);
      ctx.fillText(String(label), x, height - 10);
    }
  }

  function setupTabs() {
    const tabs = document.querySelectorAll('.calculator-tab');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.calculator-shell').forEach(panel => {
        panel.hidden = panel.id !== tab.dataset.tab;
      });
      history.replaceState(null, '', `#${tab.dataset.tab}`);
      window.dispatchEvent(new Event('resize'));
    }));
    const hash = location.hash.slice(1);
    if (hash === 'living-annuity' || hash === 'retirement-annuity') {
      const matching = document.querySelector(`[data-tab="${hash}"]`);
      if (matching) matching.click();
    }
  }

  function setupRetirementCalculator() {
    const form = document.getElementById('ra-form');
    const age = document.getElementById('ra-age');
    const income = document.getElementById('ra-income');
    const contribution = document.getElementById('ra-contribution');
    const savings = document.getElementById('ra-savings');
    const savingsWrap = document.getElementById('existing-savings-wrap');
    const resetButton = document.getElementById('ra-reset');
    [income, contribution, savings].forEach(bindMoneyInput);

    document.querySelectorAll('input[name="hasSavings"]').forEach(radio => radio.addEventListener('change', () => {
      savingsWrap.hidden = document.querySelector('input[name="hasSavings"]:checked').value !== 'yes';
      if (savingsWrap.hidden) { savings.value = ''; validationMessage(savings, ''); }
    }));

    function validate() {
      let valid = true;
      const ageValue = Number(age.value);
      if (!Number.isInteger(ageValue) || ageValue < 18 || ageValue > 65) { validationMessage(age, 'Enter a whole age from 18 to 65.'); valid = false; } else validationMessage(age, '');
      const incomeValue = parseMoney(income.value);
      if (income.value.trim() !== '' && (!Number.isFinite(incomeValue) || incomeValue < 0)) { validationMessage(income, 'Enter a valid positive Rand amount.'); valid = false; } else validationMessage(income, '');
      const contributionValue = parseMoney(contribution.value);
      if (!Number.isFinite(contributionValue) || contributionValue <= 0) { validationMessage(contribution, 'Enter a monthly contribution greater than zero.'); valid = false; }
      else if (contributionValue > CALCULATOR_CONFIG.retirement.maxMonthlyContribution) { validationMessage(contribution, `Monthly contribution cannot exceed ${formatZAR(CALCULATOR_CONFIG.retirement.maxMonthlyContribution)}.`); valid = false; }
      else validationMessage(contribution, '');
      let savingsValue = 0;
      if (!savingsWrap.hidden) {
        savingsValue = parseMoney(savings.value);
        if (!Number.isFinite(savingsValue) || savingsValue < 0) { validationMessage(savings, 'Enter a valid positive Rand amount.'); valid = false; } else validationMessage(savings, '');
      }
      return valid ? { age: ageValue, income: incomeValue, monthlyContribution: contributionValue, existingSavings: savingsValue } : null;
    }

    form.addEventListener('submit', event => {
      event.preventEventDefault?.();
      event.preventDefault();
      const data = validate(); if (!data) return;
      const result = projectRetirementAnnuity({ ...data, strategy: document.getElementById('ra-strategy').value });
      document.getElementById('ra-results').hidden = false;
      document.getElementById('ra-total').textContent = formatZAR(result.totalValue);
      document.getElementById('ra-real').textContent = formatZAR(result.todaysValue);
      document.getElementById('ra-years').textContent = String(result.yearsUntilRetirement);
      document.getElementById('ra-existing').textContent = formatZAR(result.existingSavings);
      document.getElementById('ra-future-contributions').textContent = formatZAR(result.futureContributions);
      document.getElementById('ra-total-contributions').textContent = formatZAR(result.totalContributions);
      document.getElementById('ra-growth').textContent = formatZAR(result.investmentGrowth);
      drawLineChart(document.getElementById('ra-chart'), [{ data: result.history.map(p => ({ age: p.age - data.age, value: p.balance })) }], { colors: ['#C8A96A'] });
    });

    resetButton.addEventListener('click', () => {
      form.reset(); savingsWrap.hidden = true; document.querySelectorAll('.field-error').forEach(el => el.textContent = ''); document.getElementById('ra-results').hidden = true;
    });
  }

  function setupLivingCalculator() {
    const form = document.getElementById('la-form');
    const age = document.getElementById('la-age');
    const retirementAge = document.getElementById('la-retirement-age');
    const capital = document.getElementById('la-capital');
    const drawdown = document.getElementById('la-drawdown');
    const drawdownValue = document.getElementById('la-drawdown-value');
    bindMoneyInput(capital);

    drawdown.addEventListener('input', () => { drawdownValue.textContent = `${Number(drawdown.value).toFixed(1)}%`; });

    function validate() {
      let valid = true;
      const currentAge = Number(age.value);
      if (!Number.isInteger(currentAge) || currentAge < 18 || currentAge > 54) { validationMessage(age, 'Enter a whole age from 18 to 54.'); valid = false; } else validationMessage(age, '');
      const retireAge = Number(retirementAge.value);
      if (!Number.isInteger(retireAge) || retireAge < 55 || retireAge > 65) { validationMessage(retirementAge, 'Enter a retirement age from 55 to 65.'); valid = false; }
      else if (retireAge <= currentAge) { validationMessage(retirementAge, 'Retirement age must be greater than current age.'); valid = false; }
      else validationMessage(retirementAge, '');
      const capitalValue = parseMoney(capital.value);
      if (!Number.isFinite(capitalValue) || capitalValue <= 0) { validationMessage(capital, 'Enter a retirement investment amount greater than zero.'); valid = false; } else validationMessage(capital, '');
      return valid ? { currentAge, retireAge, capital: capitalValue } : null;
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = validate(); if (!data) return;
      const rate = Number(drawdown.value) / 100;
      if (rate < CALCULATOR_CONFIG.living.minDrawdown || rate > CALCULATOR_CONFIG.living.maxDrawdown) return;
      const average = projectLivingAnnuity({ capital: data.capital, drawdownRate: rate, annualReturn: CALCULATOR_CONFIG.living.marketReturns.average });
      const good = projectLivingAnnuity({ capital: data.capital, drawdownRate: rate, annualReturn: CALCULATOR_CONFIG.living.marketReturns.good });
      document.getElementById('la-results').hidden = false;
      document.getElementById('la-monthly').textContent = formatZAR(average.initialMonthlyIncome);
      document.getElementById('la-annual').textContent = formatZAR(average.initialAnnualIncome);
      document.getElementById('la-duration-7').textContent = average.depleted ? `${average.depletionYears.toFixed(1)} years (illustrative projected depletion)` : 'Capital not depleted within the illustrated period';
      document.getElementById('la-duration-9').textContent = good.depleted ? `${good.depletionYears.toFixed(1)} years (illustrative projected depletion)` : 'Capital not depleted within the illustrated period';
      drawLineChart(document.getElementById('la-chart'), [
        { data: average.balanceHistory.map(p => ({ year: p.year, value: p.balance })) },
        { data: good.balanceHistory.map(p => ({ year: p.year, value: p.balance })) }
      ], { colors: ['#C8A96A', '#1C252E'] });
    });

    document.getElementById('la-reset').addEventListener('click', () => {
      form.reset(); drawdownValue.textContent = '4.5%'; document.querySelectorAll('.field-error').forEach(el => el.textContent = ''); document.getElementById('la-results').hidden = true;
    });

    document.getElementById('ra-link').addEventListener('click', () => {
      const tab = document.querySelector('[data-tab="retirement-annuity"]');
      if (tab) tab.click();
    });
  }

  function resizeCharts() {
    document.querySelectorAll('canvas').forEach(canvas => {
      if (canvas._vizionChartSeries) {
        drawLineChart(canvas, canvas._vizionChartSeries, canvas._vizionChartOptions);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupTabs(); setupRetirementCalculator(); setupLivingCalculator();
    window.addEventListener('resize', resizeCharts);
  });
})();
