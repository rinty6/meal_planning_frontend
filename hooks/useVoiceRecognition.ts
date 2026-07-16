import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type VoiceRecognitionStatus = 'idle' | 'listening' | 'finished' | 'error';
export type VoiceRecognitionErrorType = 'permission-denied' | 'no-speech' | 'recognizer-error';

export interface VoiceRecognitionError {
  type: VoiceRecognitionErrorType;
  message: string;
  // Only meaningful for "permission-denied" — iOS only allows one native prompt,
  // so once canAskAgain is false the UI must send the user to Settings instead.
  canAskAgain?: boolean;
  code?: string;
}

export interface UseVoiceRecognitionOptions {
  lang?: string;
  // Short custom phrases to bias recognition toward (e.g. food/recipe names).
  contextualStrings?: string[];
}

export interface UseVoiceRecognitionResult {
  state: VoiceRecognitionStatus;
  interimTranscript: string;
  finalTranscript: string;
  volume: number | null;
  error: VoiceRecognitionError | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

const DEFAULT_LANG = 'en-US';

const FRIENDLY_MESSAGES: Record<VoiceRecognitionErrorType, string> = {
  'permission-denied': 'GoodHealthMate needs microphone and speech access to search by voice.',
  'no-speech': "Didn't catch that. Try again.",
  'recognizer-error': "Didn't catch that, try again.",
};

const classifyErrorCode = (code: string): VoiceRecognitionErrorType => {
  if (code === 'not-allowed') return 'permission-denied';
  if (code === 'no-speech' || code === 'speech-timeout') return 'no-speech';
  return 'recognizer-error';
};

export function useVoiceRecognition(
  options: UseVoiceRecognitionOptions = {}
): UseVoiceRecognitionResult {
  const { lang = DEFAULT_LANG, contextualStrings } = options;

  const [state, setState] = useState<VoiceRecognitionStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [volume, setVolume] = useState<number | null>(null);
  const [error, setError] = useState<VoiceRecognitionError | null>(null);

  // True once the current session already produced a definitive result/error —
  // lets the trailing `end` event (which always fires last) know whether it
  // needs to synthesize a "no-speech" outcome or just clean up quietly.
  const resolvedRef = useRef(false);
  // True while a native recognition session is running, so stop()/reset()/unmount
  // know whether there's anything to stop or abort.
  const activeRef = useRef(false);
  // True right after reset() aborts a session — swallows any in-flight native
  // events for that session so they can't clobber the idle state we just set.
  const suppressRef = useRef(false);

  useSpeechRecognitionEvent('result', (event) => {
    if (suppressRef.current) return;
    const transcript = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      resolvedRef.current = true;
      const trimmed = transcript.trim();
      if (trimmed) {
        setFinalTranscript(trimmed);
        setState('finished');
      } else {
        setError({ type: 'no-speech', message: FRIENDLY_MESSAGES['no-speech'] });
        setState('error');
      }
    } else {
      setInterimTranscript(transcript);
    }
  });

  useSpeechRecognitionEvent('nomatch', () => {
    if (suppressRef.current) return;
    resolvedRef.current = true;
    setError({ type: 'no-speech', message: FRIENDLY_MESSAGES['no-speech'] });
    setState('error');
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (suppressRef.current) return;
    resolvedRef.current = true;
    const type = classifyErrorCode(event.error);
    setError({ type, message: FRIENDLY_MESSAGES[type], code: event.error });
    setState('error');
  });

  useSpeechRecognitionEvent('end', () => {
    activeRef.current = false;
    if (suppressRef.current) return;
    if (!resolvedRef.current) {
      // Recognition ended with no result and no error event — e.g. iOS stops
      // after ~3s of silence in non-continuous mode without emitting "no-speech".
      resolvedRef.current = true;
      setError({ type: 'no-speech', message: FRIENDLY_MESSAGES['no-speech'] });
      setState('error');
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    if (suppressRef.current) return;
    setVolume(event.value);
  });

  useEffect(() => {
    return () => {
      suppressRef.current = true;
      if (activeRef.current) {
        ExpoSpeechRecognitionModule.abort();
        activeRef.current = false;
      }
    };
  }, []);

  const start = useCallback(async () => {
    suppressRef.current = false;
    resolvedRef.current = false;
    setInterimTranscript('');
    setFinalTranscript('');
    setVolume(null);
    setError(null);

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      resolvedRef.current = true;
      setError({
        type: 'permission-denied',
        message: FRIENDLY_MESSAGES['permission-denied'],
        canAskAgain: permission.canAskAgain,
      });
      setState('error');
      return;
    }

    activeRef.current = true;
    setState('listening');
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: false,
      contextualStrings,
      volumeChangeEventOptions: { enabled: true },
    });
  }, [lang, contextualStrings]);

  const stop = useCallback(() => {
    if (activeRef.current) {
      ExpoSpeechRecognitionModule.stop();
    }
  }, []);

  const reset = useCallback(() => {
    suppressRef.current = true;
    if (activeRef.current) {
      ExpoSpeechRecognitionModule.abort();
      activeRef.current = false;
    }
    setState('idle');
    setInterimTranscript('');
    setFinalTranscript('');
    setVolume(null);
    setError(null);
  }, []);

  return { state, interimTranscript, finalTranscript, volume, error, start, stop, reset };
}
