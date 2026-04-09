def _custom_reverse(s: str) -> str:
    return s[::-1]


class FilterModule:
    def filters(self):
        return {"custom_reverse": _custom_reverse}
