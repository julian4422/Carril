import os

# Hashing rápido en pruebas (debe fijarse antes de importar la app).
os.environ.setdefault("BCRYPT_ROUNDS", "4")
os.environ["JWT_SECRET"] = "test-secret-test-secret-test-secret-0123"


def pytest_collection_modifyitems(items):
    """Marca automáticamente cada prueba según su carpeta."""
    for item in items:
        for kind in ("unit", "integration", "e2e"):
            if f"/tests/{kind}/" in str(item.fspath):
                item.add_marker(kind)
