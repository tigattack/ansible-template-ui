from ansible.plugins.lookup import LookupBase  # pyright: ignore[reportMissingTypeStubs]


class LookupModule(LookupBase):
    def run(self, terms: object, variables: object | None = None, **kwargs: object):  # pyright: ignore[reportIncompatibleMethodOverride]
        return ["custom_lookup_works"]
