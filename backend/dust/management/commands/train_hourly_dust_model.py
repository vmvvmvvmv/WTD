import json
import os

import joblib
import pandas as pd
from django.core.management.base import BaseCommand, CommandError
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer
from sklearn.preprocessing import OneHotEncoder


TARGET_COLUMN = "target_pm10"
DROP_COLUMNS = {"measured_at", "target_at", TARGET_COLUMN}
CATEGORICAL_COLUMNS = [
    "station_id",
    "city",
    "region",
    "current_weather_sky",
    "current_weather_precipitation_type",
    "target_weather_sky",
    "target_weather_precipitation_type",
]


def _astype_str(values):
    return values.astype(str)


class Command(BaseCommand):
    help = "Train a PM10 hourly prediction model from a generated training CSV."

    def add_arguments(self, parser):
        parser.add_argument(
            "--input",
            default=os.path.join("exports", "hourly_dust_training_dataset.csv"),
            help="Training CSV path made by build_hourly_dust_training_dataset.",
        )
        parser.add_argument(
            "--output",
            default=os.path.join("models", "hourly_dust_pm10_model.joblib"),
            help="Model output path.",
        )
        parser.add_argument(
            "--report",
            default=os.path.join("models", "hourly_dust_pm10_model_report.json"),
            help="Training report output path.",
        )
        parser.add_argument("--test-ratio", type=float, default=0.2, help="Time-order test split ratio.")
        parser.add_argument("--min-rows", type=int, default=200, help="Minimum rows required to train.")

    def handle(self, *args, **options):
        input_path = self._resolve_path(options["input"])
        output_path = self._resolve_path(options["output"])
        report_path = self._resolve_path(options["report"])
        test_ratio = min(max(float(options["test_ratio"]), 0.05), 0.5)
        min_rows = max(10, int(options["min_rows"]))

        if not os.path.exists(input_path):
            raise CommandError(f"Training CSV not found: {input_path}")

        dataframe = pd.read_csv(input_path)
        if TARGET_COLUMN not in dataframe.columns:
            raise CommandError(f"Missing target column: {TARGET_COLUMN}")

        dataframe = dataframe.dropna(subset=[TARGET_COLUMN]).copy()
        dataframe["target_at_sort"] = pd.to_datetime(dataframe["target_at"], errors="coerce")
        dataframe = dataframe.dropna(subset=["target_at_sort"]).sort_values("target_at_sort")

        if len(dataframe) < min_rows:
            raise CommandError(f"Not enough training rows: {len(dataframe)} < {min_rows}")

        feature_columns = [
            column for column in dataframe.columns
            if column not in DROP_COLUMNS and column != "target_at_sort"
        ]
        categorical_columns = [
            column for column in CATEGORICAL_COLUMNS
            if column in feature_columns
        ]
        numeric_columns = [
            column for column in feature_columns
            if column not in categorical_columns
        ]

        split_index = max(1, int(len(dataframe) * (1 - test_ratio)))
        train_df = dataframe.iloc[:split_index]
        test_df = dataframe.iloc[split_index:]
        if test_df.empty:
            raise CommandError("Test split is empty. Add more rows or lower --test-ratio.")

        x_train = train_df[feature_columns]
        y_train = train_df[TARGET_COLUMN]
        x_test = test_df[feature_columns]
        y_test = test_df[TARGET_COLUMN]

        preprocessor = ColumnTransformer(
            transformers=[
                ("numeric", SimpleImputer(strategy="median", keep_empty_features=True), numeric_columns),
                (
                    "categorical",
                    Pipeline([
                        ("imputer", SimpleImputer(strategy="constant", fill_value="")),
                        ("to_string", FunctionTransformer(_astype_str, feature_names_out="one-to-one")),
                        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                    ]),
                    categorical_columns,
                ),
            ],
            remainder="drop",
        )
        model = Pipeline([
            ("preprocessor", preprocessor),
            ("regressor", HistGradientBoostingRegressor(random_state=42, max_iter=250)),
        ])

        model.fit(x_train, y_train)
        predictions = model.predict(x_test)
        mse = mean_squared_error(y_test, predictions)
        report = {
            "model_name": "hist_gradient_boosting_pm10_v1",
            "rows": int(len(dataframe)),
            "train_rows": int(len(train_df)),
            "test_rows": int(len(test_df)),
            "features": feature_columns,
            "categorical_features": categorical_columns,
            "numeric_features": numeric_columns,
            "mae": round(float(mean_absolute_error(y_test, predictions)), 3),
            "rmse": round(float(mse ** 0.5), 3),
            "r2": round(float(r2_score(y_test, predictions)), 3),
        }

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        joblib.dump(
            {
                "model": model,
                "feature_columns": feature_columns,
                "target_column": TARGET_COLUMN,
                "report": report,
            },
            output_path,
        )
        with open(report_path, "w", encoding="utf-8") as report_file:
            json.dump(report, report_file, ensure_ascii=False, indent=2)

        self.stdout.write(self.style.SUCCESS(f"Model trained: {output_path}"))
        self.stdout.write(self.style.SUCCESS(f"Report: {report_path}"))
        self.stdout.write(
            self.style.SUCCESS(
                f"MAE={report['mae']} RMSE={report['rmse']} R2={report['r2']} rows={report['rows']}"
            )
        )

    def _resolve_path(self, path):
        if os.path.isabs(path):
            return path
        return os.path.abspath(path)
