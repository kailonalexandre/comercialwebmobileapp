import { View } from 'react-native';

import { usePriceTables } from '@/features/pricing/price-tables';
import { ChipRow } from '@/shared/components/chip-row';
import { Text } from '@/shared/components/text';

// Escolha rápida da tabela, sempre visível onde há preço. Com uma tabela só, não aparece.
export function PriceTablePicker({ value, onChange, disabled }: { value: string; onChange: (key: string) => void; disabled?: boolean }) {
  const { tables } = usePriceTables();
  if (tables.length < 2) return null;
  return (
    <View style={{ gap: 6, opacity: disabled ? 0.5 : 1 }} pointerEvents={disabled ? 'none' : 'auto'}>
      <Text variant="caption" color="textMuted">
        Tabela de preço
      </Text>
      <ChipRow options={tables.map((t) => ({ key: t.key, label: t.label }))} selected={value} onSelect={onChange} />
    </View>
  );
}
