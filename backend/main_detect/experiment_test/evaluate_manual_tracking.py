import csv
import sys
from pathlib import Path

def evaluate_manual(target_dirs):
    print('='*60)
    print('K?T QU? ÐÁNH GIÁ NH?Y ID (MANUAL TRACKING)')
    print('='*60)
    
    for d in target_dirs:
        path = Path(d) / 'manual_tracking.csv'
        if not path.exists():
            continue
            
        idsw = 0
        fn = 0
        history = {}
        
        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                car = row['physical_vehicle'].strip()
                ai_id = row['ai_assigned_id'].strip().lower()
                
                if ai_id in ('', 'null', 'none'):
                    fn += 1
                    continue
                    
                if car not in history:
                    history[car] = ai_id
                elif history[car] != ai_id:
                    idsw += 1
                    history[car] = ai_id
                    
        print(f'[{Path(d).name}]')
        print(f'  - L?i m?t d?u (M?t ID): {fn}')
        print(f'  - L?i nh?y ID (ID Switch): {idsw}')
        print('-'*60)

if __name__ == '__main__':
    dirs = sys.argv[1:]
    evaluate_manual(dirs)
