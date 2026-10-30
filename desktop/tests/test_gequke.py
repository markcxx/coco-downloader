import unittest
from unittest.mock import MagicMock, patch

from app.services.providers import PROVIDER_GROUPS, get_provider
from app.services.providers.gequke import GequkeProvider

PAGE = """<script>window.play_id='session-token';window.mp3_title='晴天';window.mp3_author='周杰伦';
window.mp3_cover='https://img2.kuwo.cn/test.jpg';window.mp3_extra_url='cloud-drive-link';</script>
<div id="content-lrc2">[00:01.00]页面歌词</div>"""


class GequkeTests(unittest.TestCase):
    def test_registration_and_search_ids(self):
        self.assertIsInstance(get_provider('gequke'), GequkeProvider)
        self.assertIn(('歌曲客', 'gequke'), PROVIDER_GROUPS['酷我音乐'])
        session = MagicMock()
        session.__enter__.return_value = session
        session.json.return_value = {'code': 1}
        session.request.side_effect = ['homepage', '''<table id="myTables"><tbody>
        <tr><td>1</td><td><a href="/song/326">晴天</a></td><td>周杰伦</td></tr>
        <tr><td>2</td><td><a href="/song/326">晴天</a></td><td>周杰伦</td></tr>
        </tbody></table>''']
        with patch('app.services.providers.gequke._Session', return_value=session):
            items = GequkeProvider().search('晴天')
        self.assertEqual([(item.id, item.provider) for item in items], [('326', 'gequke')])
        session.json.assert_called_once_with('/api/s', {'keyword': '晴天'})

    def test_session_token_and_no_cloud_drive_fallback(self):
        session = MagicMock()
        session.__enter__.return_value = session
        session.request.return_value = PAGE
        session.json.return_value = {'code': 200, 'data': {'url': 'https://car-er.kuwo.cn/test.mp3'}}
        provider = GequkeProvider()
        with patch('app.services.providers.gequke._Session', return_value=session), patch('app.services.providers.gequke.validate_audio_url', side_effect=lambda client, url, **kwargs: url):
            info = provider.get_play_info('326', {'playUrl': 'https://other.example/song/9'})
            session.json.assert_called_once_with('/api/music', {'id': 'session-token', 'type': '0'}, music=True)
            self.assertEqual((info.url, info.type), ('https://car-er.kuwo.cn/test.mp3', 'mp3'))
            session.json.return_value = {'code': 430}
            with self.assertRaisesRegex(ValueError, '在线音源'):
                provider.get_play_info('326')
        with self.assertRaisesRegex(ValueError, 'ID 无效'):
            provider.get_play_info('../326')



if __name__ == '__main__':
    unittest.main()
