#!/usr/bin/env python3
"""Two verified full local restore points; originals are never modified."""
import pathlib
from backup_core import run,record_status
root=pathlib.Path('/opt/zohurnews')
if __name__=='__main__':
    try:run(root)
    except Exception as e:
        record_status(root,ok=False,error=str(e))
        raise
