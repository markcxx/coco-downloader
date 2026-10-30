"""Initialize the ordinary visitor cookie published by JBSou's landing page."""
import re


def initialize_session(session, headers, timeout):
    url = "https://www.jbsou.cn/"
    with session.get(url, headers=headers, timeout=timeout) as response:
        response.raise_for_status()
        match = re.search(r'document\.cookie\s*=\s*[\"\']mk_visit=([A-Za-z0-9_-]+);', response.text)
    if match:
        session.cookies.set("mk_visit", match.group(1), domain="www.jbsou.cn", path="/")
        with session.get(url, headers=headers, timeout=timeout) as response:
            response.raise_for_status()
