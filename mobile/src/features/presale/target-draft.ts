import { useConditionalDraft } from '@/features/conditional/conditional-draft';
import { usePdvDraft } from '@/features/pdv/pdv-draft';
import { usePreSaleDraft } from '@/features/presale/presale-draft';

export function useTargetDraft(mode: string | undefined) {
  const presale = usePreSaleDraft();
  const pdv = usePdvDraft();
  const conditional = useConditionalDraft();
  return mode === 'pdv' ? pdv : mode === 'conditional' ? conditional : presale;
}
