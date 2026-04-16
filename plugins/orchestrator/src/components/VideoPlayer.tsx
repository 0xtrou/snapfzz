import type { VideoBlock } from '../types';

const emptyCaptionTrack = 'data:text/vtt,WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n ';

interface VideoPlayerProps {
  block: VideoBlock;
}

export function VideoPlayer({ block }: VideoPlayerProps) {
  return (
    <video
      controls
      preload="metadata"
      src={block.source}
      style={{
        width: '100%',
        maxWidth: 520,
        borderRadius: 8,
        border: '1px solid var(--border-default)',
      }}
    >
      <track kind="captions" src={emptyCaptionTrack} srcLang="en" label="Captions" default />
    </video>
  );
}
