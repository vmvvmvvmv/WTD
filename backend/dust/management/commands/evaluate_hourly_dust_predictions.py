from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from dust.models import HourlyDustPrediction, RealtimeDustMeasurement


class Command(BaseCommand):
    help = "Match stored hourly PM10 predictions with actual realtime measurements and calculate errors."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=3, help="Prediction target window to evaluate.")
        parser.add_argument("--limit", type=int, default=1000, help="Maximum prediction rows to evaluate.")

    def handle(self, *args, **options):
        days = max(1, options["days"])
        limit = max(1, options["limit"])
        now = timezone.now()
        cutoff = now - timedelta(days=days)

        predictions = (
            HourlyDustPrediction.objects
            .filter(evaluated_at__isnull=True, target_at__gte=cutoff, target_at__lte=now)
            .order_by("target_at")[:limit]
        )

        evaluated = 0
        skipped = 0
        for prediction in predictions:
            window_start = prediction.target_at - timedelta(minutes=30)
            window_end = prediction.target_at + timedelta(minutes=30)
            actual = (
                RealtimeDustMeasurement.objects
                .filter(
                    station=prediction.station,
                    measured_at__gte=window_start,
                    measured_at__lte=window_end,
                    pm10_value__isnull=False,
                )
                .order_by("measured_at")
                .first()
            )
            if not actual:
                skipped += 1
                continue

            error = abs(prediction.pm10_predicted - actual.pm10_value)
            prediction.pm10_actual = actual.pm10_value
            prediction.absolute_error = error
            prediction.squared_error = error ** 2
            prediction.evaluated_at = now
            prediction.save(update_fields=[
                "pm10_actual",
                "absolute_error",
                "squared_error",
                "evaluated_at",
                "updated_at",
            ])
            evaluated += 1

        self.stdout.write(self.style.SUCCESS(f"Hourly predictions evaluated: {evaluated}"))
        if skipped:
            self.stdout.write(f"Hourly predictions skipped without actual value: {skipped}")
