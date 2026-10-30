import base64
import unittest
from unittest.mock import Mock, patch
from app.services.lyric_utils import parse_lrc_lines
from app.services.lyrics import NeteaseLyrics, QQLyrics, KugouLyrics, KuwoLyrics


class LyricsTests(unittest.TestCase):
    def test_timestamp_precision_multiple_tags_and_word_timing(self):
        result = parse_lrc_lines('[00:02.03][00:01.2]<200,100>hello\n[00:03.004]world\n[ar:artist]')
        self.assertEqual([(i.time, i.text) for i in result], [(1.2, 'hello'), (2.03, 'hello'), (3.004, 'world')])

    @patch.object(NeteaseLyrics, '_make_lyric_request')
    def test_netease_lyric_uses_song_id_only(self, request):
        request.return_value = {'lrc': {'lyric': '[00:01.20]hello'}}
        result = NeteaseLyrics().get_lyric('123')
        self.assertEqual(request.call_args.args[0]['id'], 123)
        self.assertEqual(result.lines[0].time, 1.2)

    def test_qq_lyric_headers_and_decoding(self):
        client = QQLyrics()
        client._http = Mock()
        client._http.get_json.return_value = {'lyric': base64.b64encode(b'[00:01]hello').decode()}
        self.assertEqual(client.get_lyric('songmid').lines[0].text, 'hello')
        args, kwargs = client._http.get_json.call_args
        self.assertIn('/lyric/', args[0])
        self.assertTrue(kwargs['headers']['User-Agent'])
        self.assertEqual(kwargs['params']['songmid'], 'songmid')

    def test_kugou_lyric_candidate_and_content_only(self):
        client = KugouLyrics()
        client._http = Mock()
        client._http.get_json.side_effect = [
            {'candidates': [{'id': '7', 'accesskey': 'key'}]},
            {'content': base64.b64encode(b'[00:01]hello').decode()},
        ]
        self.assertEqual(client.get_lyric('hash').lines[0].text, 'hello')
        self.assertTrue(all('lyrics.kugou.com/' in call.args[0] for call in client._http.get_json.call_args_list))

    def test_kuwo_lyric_content_only(self):
        client = KuwoLyrics()
        client._http = Mock()
        client._http.get_json.return_value = {'data': {'content': base64.b64encode(b'[00:01]hello').decode()}}
        self.assertEqual(client.get_lyric('123').lines[0].text, 'hello')
        self.assertIn('mlyric.kuwo.cn', client._http.get_json.call_args.args[0])
