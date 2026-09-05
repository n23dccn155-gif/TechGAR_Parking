import csv
import sys
from pathlib import Path

def evaluate_manual(target_dirs):
    print('='*70)
    print('   KẾT QUẢ ĐÁNH GIÁ TRACKING THỦ CÔNG (MANUAL TRACKING EVALUATION)')
    print('='*70)
    
    for d in target_dirs:
        path = Path(d) / 'manual_tracking.csv'
        if not path.exists():
            print(f'[-] Khong tim thay: {path}')
            continue
            
        idsw = 0
        fn = 0
        history = {}
        total_rows = 0
        
        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_rows += 1
                car = row.get('physical_vehicle', '').strip()
                ai_id = row.get('ai_assigned_id', '').strip().lower()
                
                if not car:
                    continue
                    
                if ai_id in ('', 'null', 'none'):
                    fn += 1
                    continue
                    
                if car not in history:
                    history[car] = ai_id
                elif history[car] != ai_id:
                    idsw += 1
                    history[car] = ai_id
                    
        print(f'Thư mục: [{Path(d).name}]')
        print(f'  - Tổng số mẫu quan sát : {total_rows}')
        print(f'  - Lỗi mất dấu (Mất ID)  : {fn}')
        print(f'  - Lỗi nhảy ID (ID Switch): {idsw}')
        print('-'*70)

if __name__ == '__main__':
    dirs = sys.argv[1:]
    if not dirs:
        print('Usage: python evaluate_manual_tracking.py <dir1> <dir2> ...')
    else:
        evaluate_manual(dirs)
