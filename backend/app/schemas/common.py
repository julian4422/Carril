from typing import Annotated

from pydantic import StringConstraints

Color = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


def trimmed(max_length: int):
    return Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)]
