import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { formatXof } from '@/lib/utils';

interface BuyPanelProps {
  fromPrice: number | null;
  onBuyClick: () => void;
}

export function BuyPanel({ fromPrice, onBuyClick }: BuyPanelProps) {
  return (
    <Panel className="text-center">
      <div className="text-[13px] font-semibold text-text-muted">Dès</div>
      <div className="mb-4 text-[28px] font-black text-text">{fromPrice != null ? formatXof(fromPrice) : '—'}</div>
      <Button onClick={onBuyClick} className="w-full justify-center">
        Obtenir des tickets
      </Button>
    </Panel>
  );
}
