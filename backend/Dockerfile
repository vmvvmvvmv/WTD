# Step 1: Base Image
FROM python:3.9-slim

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

# gunicorn 사용하는 경우
CMD ["gunicorn", "--bind","0.0.0.0:8000","config.wsgi:application"]

