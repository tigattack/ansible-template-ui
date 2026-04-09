def _custom_truthy(x: object) -> bool:
    return bool(x)


class TestModule:
    def tests(self):
        return {"custom_truthy": _custom_truthy}
