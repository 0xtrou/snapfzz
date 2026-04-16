import type { AudioBlock } from '../types';

const emptyCaptionTrack = 'data:text/vtt,WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n ';

interface AudioPlayerProps {
  block: AudioBlock;
}

export function AudioPlayer({ block }: AudioPlayerProps) {
  return (
    <audio
      controls
      preload="metadata"
      src={block.source}
      style={{
        width: '100%',
        maxWidth: 420,
      }}
    >
      <track kind="captions" src={emptyCaptionTrack} srcLang="en" label="Captions" default />
    </audio>
  );
}
