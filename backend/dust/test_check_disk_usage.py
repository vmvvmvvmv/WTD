from collections import namedtuple
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase

from dust.management.commands import check_disk_usage as module

Usage = namedtuple("Usage", "total used free")


class CheckDiskUsageTests(SimpleTestCase):
    def run_with(self, *used_values):
        usages = [Usage(100, used, 100 - used) for used in used_values]
        with patch.object(module.shutil, "disk_usage", side_effect=usages), \
                patch.object(module, "alert_admins") as alert, \
                patch.object(module, "clean_disk", return_value=["앱 캐시"]) as clean:
            try:
                call_command("check_disk_usage", stdout=open(__import__("os").devnull, "w"))
                failed = False
            except CommandError:
                failed = True
        return alert, clean, failed

    def test_below_warn_does_nothing(self):
        alert, clean, failed = self.run_with(50)
        alert.assert_not_called(), clean.assert_not_called()
        self.assertFalse(failed)

    def test_warn_alerts_without_cleaning(self):
        alert, clean, failed = self.run_with(85)
        clean.assert_not_called()
        self.assertEqual(alert.call_args.args[0], "disk:warn")
        self.assertFalse(failed)

    def test_full_cleans_and_reports_result(self):
        alert, clean, failed = self.run_with(100, 60)
        clean.assert_called_once()
        self.assertIn("100%", alert.call_args.args[2])
        self.assertIn("60%", alert.call_args.args[2])
        self.assertFalse(failed)

    def test_still_full_after_cleanup_fails(self):
        alert, clean, failed = self.run_with(100, 95)
        self.assertTrue(failed)
        self.assertIn("직접 확인", alert.call_args.args[2])
