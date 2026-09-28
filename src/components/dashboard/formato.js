// Formato de dinero del Dashboard.

const pesos = (n) => Math.abs(Number(n) || 0)
  .toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** El signo va antes del símbolo: −$100.00, no $-100.00. */
export const fmt = (n) => `${(Number(n) || 0) < 0 ? '−' : ''}$${pesos(n)}`;

/** Con signo explícito, para diferencias de arqueo (+$80.00 sobrante / −$50.00 faltante). */
export const fmtFirmado = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.005) return `$${pesos(0)}`;
  return `${v > 0 ? '+' : '−'}$${pesos(v)}`;
};
