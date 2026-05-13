export enum AudioCueId {
  ButtonClick = 'sfx_button_click',
  CountdownTick = 'sfx_countdown_tick',
  CountdownFinalTick = 'sfx_countdown_final_tick',
  DisguiseSwitch = 'sfx_disguise_switch',
  AttackSwing = 'sfx_attack_swing',
  AttackMiss = 'sfx_attack_miss',
  AttackPropHit = 'sfx_attack_prop_hit',
  AttackHiderHit = 'sfx_attack_hider_hit',
  AttackDepleted = 'sfx_attack_depleted',
  PropBreak = 'sfx_prop_break',
  Capture = 'sfx_capture',
  RoundStart = 'sfx_round_start',
  RoundEnd = 'sfx_round_end',
  Victory = 'sfx_victory',
  Defeat = 'sfx_defeat'
}

export interface AudioCueDefinition {
  readonly id: AudioCueId;
  readonly placeholderPath: string;
  readonly purpose: string;
  readonly volume: number;
  readonly priority: 'low' | 'normal' | 'high';
  readonly sourceStatus: 'placeholder_only';
}

export const AUDIO_CUE_CATALOG: Record<AudioCueId, AudioCueDefinition> = {
  [AudioCueId.ButtonClick]: cue(AudioCueId.ButtonClick, 'client/assets/audio/sfx/sfx_button_click.wav', 'UI button click.', 0.55, 'low'),
  [AudioCueId.CountdownTick]: cue(AudioCueId.CountdownTick, 'client/assets/audio/sfx/sfx_countdown_tick.wav', 'Standard countdown tick.', 0.45, 'normal'),
  [AudioCueId.CountdownFinalTick]: cue(AudioCueId.CountdownFinalTick, 'client/assets/audio/sfx/sfx_countdown_final_tick.wav', 'Last five seconds countdown accent.', 0.65, 'high'),
  [AudioCueId.DisguiseSwitch]: cue(AudioCueId.DisguiseSwitch, 'client/assets/audio/sfx/sfx_disguise_switch.wav', 'Light prop switch cue.', 0.45, 'low'),
  [AudioCueId.AttackSwing]: cue(AudioCueId.AttackSwing, 'client/assets/audio/sfx/sfx_attack_swing.wav', 'Seeker sector swing.', 0.65, 'normal'),
  [AudioCueId.AttackMiss]: cue(AudioCueId.AttackMiss, 'client/assets/audio/sfx/sfx_attack_miss.wav', 'Attack found nothing.', 0.5, 'normal'),
  [AudioCueId.AttackPropHit]: cue(AudioCueId.AttackPropHit, 'client/assets/audio/sfx/sfx_attack_prop_hit.wav', 'Attack hit one or more props.', 0.7, 'normal'),
  [AudioCueId.AttackHiderHit]: cue(AudioCueId.AttackHiderHit, 'client/assets/audio/sfx/sfx_attack_hider_hit.wav', 'Attack caught a hider.', 0.85, 'high'),
  [AudioCueId.AttackDepleted]: cue(AudioCueId.AttackDepleted, 'client/assets/audio/sfx/sfx_attack_depleted.wav', 'No attacks remain.', 0.75, 'high'),
  [AudioCueId.PropBreak]: cue(AudioCueId.PropBreak, 'client/assets/audio/sfx/sfx_prop_break.wav', 'Confirmed prop break.', 0.7, 'normal'),
  [AudioCueId.Capture]: cue(AudioCueId.Capture, 'client/assets/audio/sfx/sfx_capture.wav', 'Confirmed hider capture.', 0.85, 'high'),
  [AudioCueId.RoundStart]: cue(AudioCueId.RoundStart, 'client/assets/audio/sfx/sfx_round_start.wav', 'Round or phase starts.', 0.65, 'normal'),
  [AudioCueId.RoundEnd]: cue(AudioCueId.RoundEnd, 'client/assets/audio/sfx/sfx_round_end.wav', 'Round result transition.', 0.7, 'normal'),
  [AudioCueId.Victory]: cue(AudioCueId.Victory, 'client/assets/audio/sfx/sfx_victory.wav', 'Local player wins the match.', 0.85, 'high'),
  [AudioCueId.Defeat]: cue(AudioCueId.Defeat, 'client/assets/audio/sfx/sfx_defeat.wav', 'Local player loses the match.', 0.75, 'high')
};

export const REQUIRED_AUDIO_CUE_IDS: readonly AudioCueId[] = Object.freeze(Object.values(AudioCueId));

function cue(
  id: AudioCueId,
  placeholderPath: string,
  purpose: string,
  volume: number,
  priority: AudioCueDefinition['priority']
): AudioCueDefinition {
  return {
    id,
    placeholderPath,
    purpose,
    volume,
    priority,
    sourceStatus: 'placeholder_only'
  };
}

