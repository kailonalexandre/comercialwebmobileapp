import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

// Conjunto único de ícones do app (Ionicons) para manter consistência visual.
export type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = Ionicons;
