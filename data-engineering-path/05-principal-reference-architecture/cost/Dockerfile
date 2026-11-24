FROM python:3.12-slim-bookworm
RUN pip install --no-cache-dir pytest==9.2.0 ruff==0.17.5
WORKDIR /cost
COPY . /cost
CMD ["sh", "-c", "ruff check . && ruff format --check . && pytest tests && python estimate.py"]
