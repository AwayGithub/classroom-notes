import asyncio
import unittest
from unittest.mock import patch

import numpy as np
from whisperlivekit.silero_vad_iterator import FixedVADIterator
from whisperlivekit.audio_processor import AudioProcessor, SENTINEL
from speech_vad import ClassroomAudioProcessor, configure_classroom_vad, install_classroom_audio_processor


class ProbabilityModel:
    def reset_states(self):
        pass

    def __call__(self, samples, rate):
        return samples.mean()


class ClassroomVadTests(unittest.TestCase):
    def iterator(self):
        processor=type('Processor',(),{})()
        processor.vac=FixedVADIterator(ProbabilityModel())
        configure_classroom_vad(processor)
        return processor.vac

    def feed(self, vad, probability, frames):
        events=[]
        for _ in range(frames):
            events.extend(vad(np.full(512,probability,dtype=np.float32)) or [])
        return events

    def test_short_pauses_keep_one_utterance(self):
        for frames in (4,10,18,31,43):  # 128 ms through 1.376 s pauses
            with self.subTest(frames=frames):
                vad=self.iterator()
                events=self.feed(vad,.9,12)+self.feed(vad,.05,frames)+self.feed(vad,.9,12)
                self.assertEqual(sum('start' in e for e in events),1)
                self.assertFalse(any('end' in e for e in events))

    def test_long_silence_still_ends_and_next_speech_starts(self):
        vad=self.iterator()
        events=self.feed(vad,.9,12)+self.feed(vad,.05,60)+self.feed(vad,.9,12)
        self.assertEqual([next(iter(e)) for e in events],['start','end','start'])

    def test_silence_stays_silent_and_threshold_unchanged(self):
        vad=self.iterator()
        self.assertFalse(self.feed(vad,.05,100))
        self.assertEqual(vad.threshold,.5)
        self.assertEqual(vad.speech_pad_samples,480)

    def test_every_new_processor_applies_policy(self):
        def fake_init(instance,**kwargs):
            instance.vac=FixedVADIterator(ProbabilityModel())
        with patch.object(AudioProcessor,'__init__',fake_init):
            a=ClassroomAudioProcessor();b=ClassroomAudioProcessor()
        self.assertEqual(a.vac.min_silence_samples,24000)
        self.assertIsNot(a.vac,b.vac)

    def test_vac_disabled_is_supported(self):
        processor=type('Processor',(),{'vac':None})()
        configure_classroom_vad(processor)
        self.assertIsNone(processor.vac)

    def test_installs_processor_used_by_mounted_routes(self):
        from whisperlivekit import basic_server
        with patch.object(basic_server,'AudioProcessor',AudioProcessor):
            install_classroom_audio_processor()
            self.assertIs(basic_server.AudioProcessor,ClassroomAudioProcessor)

    def test_stop_does_not_wait_for_silence_deadline(self):
        async def scenario():
            processor=object.__new__(ClassroomAudioProcessor)
            processor.vac=self.iterator()
            self.feed(processor.vac,.9,12)
            self.feed(processor.vac,.05,4)
            self.assertTrue(processor.vac.triggered)
            processor.current_silence=None
            processor.transcription_queue=asyncio.Queue()
            await asyncio.wait_for(processor._finish_input(),timeout=.2)
            self.assertIs(processor.transcription_queue.get_nowait(),SENTINEL)
        asyncio.run(scenario())
