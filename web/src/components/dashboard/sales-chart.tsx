const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function SalesChart({ data }: { data: { date: string; ordersCount: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.ordersCount));

  return (
    <div className="mb-2.5 flex h-[140px] items-end gap-3">
      {data.map((day) => {
        const dayOfWeek = new Date(`${day.date}T00:00:00Z`).getUTCDay();
        const heightPct = (day.ordersCount / max) * 100;
        return (
          <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div
              className="w-full rounded-t-[3px] bg-indigo"
              style={{ height: `${day.ordersCount === 0 ? 4 : Math.max(6, heightPct)}%` }}
            />
            <div className="text-[11px] font-semibold text-text-muted">{DAY_LABELS[dayOfWeek]}</div>
          </div>
        );
      })}
    </div>
  );
}
