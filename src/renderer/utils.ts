export const number = (value: unknown) => new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
export const money = (value: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
export const date = (value: unknown) => {
  if (!value) return "—";
  const parsed = new Date(String(value).length === 10 ? `${value}T12:00:00` : String(value));
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
};