"""Reglas puras de posiciones: base 0, contiguas, sin efectos secundarios."""
from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")


def clamp_position(position: int, length: int) -> int:
    """Acota `position` al rango 0..length."""
    return max(0, min(position, length))


def insert_at(items: Sequence[T], item: T, position: int) -> list[T]:
    """Inserta `item` en `position` (acotada) dentro de una copia de `items`."""
    result = list(items)
    result.insert(clamp_position(position, len(result)), item)
    return result


def remove_item(items: Sequence[T], item: T) -> list[T]:
    return [i for i in items if i != item]


def move_within(items: Sequence[T], item: T, position: int) -> list[T]:
    """Mueve `item` dentro de la misma lista; `position` se acota a 0..len(resto)."""
    return insert_at(remove_item(items, item), item, position)


def move_between(
    source: Sequence[T], target: Sequence[T], item: T, position: int
) -> tuple[list[T], list[T]]:
    """Mueve `item` de `source` a `target`. Devuelve (nuevo_source, nuevo_target)."""
    return remove_item(source, item), insert_at(target, item, position)


def same_members(current: Sequence[T], proposed: Sequence[T]) -> bool:
    """True si `proposed` contiene exactamente los mismos elementos que `current`, sin repetidos."""
    return len(proposed) == len(set(proposed)) and set(current) == set(proposed)


def renumber(objs: Sequence) -> None:
    """Asigna position = 0..n-1 según el orden dado (solo toca los que cambian)."""
    for index, obj in enumerate(objs):
        if obj.position != index:
            obj.position = index
