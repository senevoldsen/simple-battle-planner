import logging

logging.TRACE = 5
logging.addLevelName(logging.TRACE, 'TRACE')


def setup_logger():
    global logging

    class BPLogger(logging.getLoggerClass()):
        def __init__(self, name, *args, **kwargs):
            logging.Logger.__init__(self, name, *args, **kwargs)

        def trace(self, msg, *args, **kwargs):
            self.log(logging.TRACE, msg, *args, **kwargs)

    prev_logger_class = logging.getLoggerClass()
    # Restore logger class afterwards
    logging.setLoggerClass(BPLogger)
    logger = logging.getLogger('BP_SERVER')
    logging.setLoggerClass(prev_logger_class)
    return logger


def log_method_call(func):
    global log
    def wrapped(self, *args, **kwargs):
        log.trace('%s called with args=%s and kwargs=%s', func.__name__, args, kwargs)
        func(self, *args, **kwargs)
    return wrapped


log = setup_logger()
log.setLevel(logging.TRACE)
log_handler = logging.StreamHandler()
log_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
log.addHandler(log_handler)
