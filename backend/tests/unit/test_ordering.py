from types import SimpleNamespace

import pytest

from app.services import ordering as o


@pytest.mark.parametrize("pos,n,exp", [(-3, 4, 0), (0, 4, 0), (2, 4, 2), (4, 4, 4), (99, 4, 4), (5, 0, 0)])
def test_clamp(pos, n, exp):
    assert o.clamp_position(pos, n) == exp


def test_insert_and_remove_do_not_mutate():
    src = [1, 2, 3]
    assert o.insert_at(src, 9, 1) == [1, 9, 2, 3]
    assert o.remove_item(src, 2) == [1, 3]
    assert src == [1, 2, 3]


@pytest.mark.parametrize(
    "item,pos,exp",
    [
        ("a", 2, ["b", "c", "a", "d"]),  # abajo
        ("d", 0, ["d", "a", "b", "c"]),  # arriba
        ("b", 1, ["a", "b", "c", "d"]),  # misma posición
        ("a", 100, ["b", "c", "d", "a"]),  # acotado al final
        ("c", -1, ["c", "a", "b", "d"]),  # acotado al inicio
    ],
)
def test_move_within(item, pos, exp):
    assert o.move_within(["a", "b", "c", "d"], item, pos) == exp


def test_move_between():
    s, t = o.move_between(["a", "b", "c"], ["x", "y"], "b", 1)
    assert s == ["a", "c"] and t == ["x", "b", "y"]
    s, t = o.move_between(["a"], [], "a", 7)
    assert s == [] and t == ["a"]


def test_same_members():
    assert o.same_members([1, 2, 3], [3, 1, 2])
    assert not o.same_members([1, 2, 3], [1, 2])
    assert not o.same_members([1, 2], [1, 1, 2])
    assert not o.same_members([1, 2], [1, 3])


def test_renumber_is_contiguous():
    objs = [SimpleNamespace(position=p) for p in (5, 0, 9)]
    o.renumber(objs)
    assert [x.position for x in objs] == [0, 1, 2]
