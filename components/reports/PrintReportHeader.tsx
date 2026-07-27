function formatReportDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getReportPeriod(from: string, to: string) {
  if (from && to) {
    if (from === to) return formatReportDate(from);
    return `${formatReportDate(from)} – ${formatReportDate(to)}`;
  }
  if (from) return `From ${formatReportDate(from)}`;
  if (to) return `Up to ${formatReportDate(to)}`;
  return "All dates";
}

export function PrintReportHeader({
  title,
  period,
}: {
  title: string;
  period: string;
}) {
  return (
    <div className="print-report-header hidden text-center print:block">
      <h1 className="text-xl font-black tracking-wide">ISAY FRIED CHICKEN</h1>
      <p className="mt-1 text-base font-bold">{title}</p>
      <p className="mt-1 text-sm">{period}</p>
    </div>
  );
}
