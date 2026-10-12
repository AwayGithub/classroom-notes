"""Classroom-specific pause policy, without modifying the bundled ASR package."""
import logging
from whisperlivekit.audio_processor import AudioProcessor

MIN_SILENCE_MS = 1500


def configure_classroom_vad(processor):
    # WLK's 100 ms default flushes/resets ASR on brief pauses inside a sentence.
    # Keep detection sensitivity/padding intact; only delay the end decision.
    if processor.vac is not None:
        processor.vac.min_silence_samples = processor.vac.sampling_rate * MIN_SILENCE_MS / 1000


class ClassroomAudioProcessor(AudioProcessor):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        configure_classroom_vad(self)


def install_classroom_audio_processor():
    from whisperlivekit import basic_server
    # The mounted WLK routes construct their processor through this module binding.
    basic_server.AudioProcessor = ClassroomAudioProcessor
    logging.getLogger(__name__).info('Classroom VAD minimum silence: %d ms', MIN_SILENCE_MS)
