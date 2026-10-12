FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=300

RUN groupadd --system --gid 10001 owl \
 && useradd --system --uid 10001 --gid owl --home-dir /home/owl --shell /usr/sbin/nologin owl

WORKDIR /opt/owl

# Security: only the manifest and the app package are copied, so local secrets such as
# services/agent/.env, the developer venv and test data never enter the image.
COPY pyproject.toml ./
COPY app ./app

RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']))" > /tmp/requirements.txt \
 && python -m pip install --requirement /tmp/requirements.txt \
 && rm -f /tmp/requirements.txt

RUN mkdir -p /workspace/sample/src /workspace/sample/tests /data /home/owl \
 && printf 'def add(a, b):\n    return a + b\n' > /workspace/sample/src/calc.py \
 && printf 'from src.calc import add\n\n\ndef test_add():\n    assert add(2, 3) == 5\n' > /workspace/sample/tests/test_calc.py \
 && printf '# Sample workspace\n\nDisposable project for the OWL security lab.\n' > /workspace/sample/README.md \
 && printf 'OWL_LAB_CANARY=this-file-must-never-be-returned\n' > /workspace/sample/.env \
 && chown -R owl:owl /workspace /data /home/owl \
 && chmod 0700 /data /home/owl

USER 10001:10001

EXPOSE 8000

HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=12 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"]

CMD ["python", "-m", "uvicorn", "--factory", "app:create_app", "--host", "0.0.0.0", "--port", "8000"]
