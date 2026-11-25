import tempfile
from unittest import mock

from django.test import SimpleTestCase

from dust.cache_backend import SafeFileBasedCache


class SafeFileBasedCacheTests(SimpleTestCase):
    def test_disk_full_write_does_not_raise(self):
        cache = SafeFileBasedCache(tempfile.mkdtemp(), {})
        disk_full = OSError(28, "No space left on device")
        with mock.patch("django.core.cache.backends.filebased.tempfile.mkstemp", side_effect=disk_full):
            cache.set("k", "v")
            cache.add("k2", "v")
        self.assertIsNone(cache.get("k"))
        cache.set("k", "v")
        self.assertEqual(cache.get("k"), "v")
