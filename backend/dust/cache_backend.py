import logging

from django.core.cache.backends.filebased import FileBasedCache

logger = logging.getLogger(__name__)


class SafeFileBasedCache(FileBasedCache):
    """캐시 쓰기 실패(디스크 가득 참 등)가 요청 전체를 500으로 만들지 않게, Redis의 IGNORE_EXCEPTIONS처럼 넘긴다.
    add도 안에서 set을 부르므로 같이 막힌다."""

    def set(self, *args, **kwargs):
        try:
            super().set(*args, **kwargs)
        except OSError:
            logger.warning("Cache write failed", exc_info=True)
