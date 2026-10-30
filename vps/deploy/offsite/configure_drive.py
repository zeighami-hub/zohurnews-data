#!/usr/bin/env python3
"""Run only in the owner's interactive VPS terminal. Never print credentials."""
import configparser, getpass, json, os, pathlib, subprocess, tempfile

ROOT = pathlib.Path('/opt/zohurnews')
FOLDER = '1VxFw7Bzr80HUJLfkI_hwWCZQB4QrnauT'

def main():
    if os.geteuid() != 0: raise SystemExit('Run with sudo')
    os.umask(0o077)
    folder = input('Drive folder ID [ZohurNews Backups]: ').strip() or FOLDER
    if not folder.replace('-', '').replace('_', '').isalnum(): raise SystemExit('Invalid folder ID')
    print('On Windows run Authorize-Google.cmd. Paste its token JSON HERE, not into chat.')
    token = json.loads(getpass.getpass('Google token JSON (hidden): '))
    if not token.get('refresh_token') or not token.get('access_token'): raise SystemExit('Invalid authorization token')
    password = getpass.getpass('New backup recovery passphrase (at least 20 characters): ')
    if len(password) < 20 or password != getpass.getpass('Repeat passphrase: '): raise SystemExit('Passphrases differ or too short')
    # obscure is reversible encoding, NOT protection. Config must remain root-only.
    obscured = subprocess.run(['rclone', 'obscure', '-'], input=password + '\n', capture_output=True, text=True, check=True).stdout.strip()
    cfg = configparser.ConfigParser(interpolation=None)
    cfg['zohur-drive'] = {'type':'drive', 'scope':'drive', 'root_folder_id':folder, 'token':json.dumps(token)}
    cfg['zohur-crypt'] = {'type':'crypt', 'remote':'zohur-drive:encrypted-v1', 'filename_encryption':'standard', 'directory_name_encryption':'true', 'password':obscured}
    private = ROOT / 'private'; private.mkdir(mode=0o700, exist_ok=True)
    final = private / 'rclone.conf'
    if final.exists(): raise SystemExit('Existing configuration retained. Review it before replacing; encryption keys must not change.')
    with tempfile.NamedTemporaryFile(mode='w', dir=private, delete=False) as f: cfg.write(f); candidate = pathlib.Path(f.name)
    try:
        # This verifies the selected folder belongs to/has access for the authorized account.
        subprocess.run(['rclone','--config',str(candidate),'lsf','zohur-drive:','--max-depth','1'],check=True,stdout=subprocess.DEVNULL)
        candidate.replace(final); final.chmod(0o600)
    finally: candidate.unlink(missing_ok=True)
    print('Configuration saved. Keep the passphrase in your password manager and one offline recovery copy.')
    print('Testing first encrypted cloud backup and full restore. This can take several minutes.')
    subprocess.run(['systemctl','start','zohurnews-cloud-backup.service'],check=True)
    subprocess.run(['systemctl','enable','--now','zohurnews-cloud-backup.timer'],check=True)
    print('Cloud backup verified and timer enabled. Local backup retention remains unchanged until reviewed.')

if __name__ == '__main__': main()
