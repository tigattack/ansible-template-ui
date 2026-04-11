class GalaxyWarmupInProgressError(Exception):
    pass


class RenderTimeoutError(Exception):
    pass


class RenderExecutionError(Exception):
    pass


class DockerImageError(Exception):
    pass


class PluginIntrospectionInProgressError(Exception):
    pass
