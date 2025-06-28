from flask import Flask, render_template, request, jsonify, send_file
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os
import pandas as pd
import logging
import mplfinance as mpf
from io import BytesIO
import pytz
from datetime import time, timedelta

# Initialize Flask app
app = Flask(__name__)
limiter = Limiter(app=app, key_func=get_remote_address)

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('app_debug.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

DATA_DIR = 'data/'
TICKER_FILES = {
    'AAPL': ['AAPL_1min_candles_10years_part1.csv', 'AAPL_1min_candles_10years_part2.csv'],
    'META': ['META_1min_candles_10years_part1.csv', 'META_1min_candles_10years_part2.csv'],
    'MSFT': ['MSFT_1min_candles_10years_part1.csv', 'MSFT_1min_candles_10years_part2.csv'],
    'MSTR': ['MSTR_1min_candles_10years_part1.csv', 'MSTR_1min_candles_10years_part2.csv'],
    'NVDA': ['NVDA_1min_candles_10years_part1.csv', 'NVDA_1min_candles_10years_part2.csv'],
    'ORCL': ['ORCL_1min_candles_10years_part1.csv', 'ORCL_1min_candles_10years_part2.csv'],
    'PLTR': ['PLTR_1min_candles_10years_part1.csv', 'PLTR_1min_candles_10years_part2.csv'],
    'QQQ': ['qqq_10yr_1min_part1.csv', 'qqq_10yr_1min_part2.csv'],
    'TSLA': ['TSLA_1min_candles_10years_part1.csv', 'TSLA_1min_candles_10years_part2.csv'],
    'UBER': ['UBER_1min_candles_10years_part1.csv', 'UBER_1min_candles_10years_part2.csv']
}

def is_market_hours(dt):
    return time(9, 30) <= dt.time() <= time(16, 0)

@app.route('/')
def index():
    logger.debug("Rendering index.html")
    return render_template('index.html', tickers=TICKER_FILES.keys())

@app.route('/api/stock/chart', methods=['GET'])
@limiter.limit("5 per day")
def get_stock_chart():
    ticker = request.args.get('ticker', 'QQQ').upper()
    date = request.args.get('date', '2015-01-02')

    logger.debug(f"Received request: ticker={ticker}, date={date}, raw query: {request.args}")
    logger.debug(f"Request URL: {request.url}")

    if not ticker or ticker not in TICKER_FILES:
        logger.error(f"Invalid ticker: {ticker}")
        return jsonify({'error': f'Invalid ticker: {ticker}. Available tickers: {list(TICKER_FILES.keys())}'}), 404

    file_paths = [os.path.join(DATA_DIR, f) for f in TICKER_FILES[ticker]]
    logger.debug(f"Checking files: {file_paths}")

    try:
        # Load and concatenate data from both files
        df_list = []
        for file_path in file_paths:
            if os.path.exists(file_path):
                df = pd.read_csv(file_path)
                missing_cols = [col for col in ['timestamp', 'open', 'high', 'low', 'close', 'volume'] if col not in df.columns]
                if missing_cols:
                    logger.warning(f"File {file_path} missing columns: {missing_cols}")
                    for col in missing_cols:
                        df[col] = 0  # Fallback for missing columns
                df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume']]
                df['datetime'] = pd.to_datetime(df['timestamp'], utc=True)
                df['datetime_et'] = df['datetime'].dt.tz_convert('US/Eastern')
                df.set_index('datetime_et', inplace=True)
                df_list.append(df)
            else:
                logger.error(f"Data file not found: {file_path}")
                return jsonify({'error': f'Data file not found: {file_path}'}), 404

        df = pd.concat(df_list) if df_list else pd.DataFrame()
        logger.debug(f"Loaded data shape: {df.shape}")

        if df.empty:
            logger.warning(f"No data found for {ticker}")
            return jsonify({'error': f'No data available for {ticker}'}), 404

        df_market = df[df.index.map(is_market_hours)].copy()
        df_market['date'] = df_market.index.date

        # Filter by date
        target_date = pd.to_datetime(date).date()
        df_day = df_market[df_market['date'] == target_date]
        if df_day.empty:
            logger.warning(f"No data found for {ticker} on {date}")
            return jsonify({'error': f'No data available for {ticker} on {date}'}), 404

        logger.debug(f"Data for {date} shape: {df_day.shape}")

        # Fill missing minutes
        date_range = pd.date_range(start=f"{date} 09:30:00", end=f"{date} 16:00:00", freq='1min', tz='US/Eastern')
        df_day = df_day.reindex(date_range, method='ffill').reset_index()
        df_day = df_day.rename(columns={'index': 'datetime_et'})
        df_day = df_day.dropna(subset=['open', 'high', 'low', 'close'])

        # Prepare data for mplfinance
        df_day = df_day[['datetime_et', 'open', 'high', 'low', 'close', 'volume']]
        df_day.columns = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
        df_day.set_index('Date', inplace=True)
        df_day.index = pd.to_datetime(df_day.index)

        # Generate chart
        try:
            fig, ax = mpf.plot(df_day, type='candle', style='charles', title=f'{ticker} 1-Minute Candlestick Chart for {date}',
                              ylabel='Price', xlabel='Time (ET)', returnfig=True, volume=False, figsize=(12, 6))
            img_buffer = BytesIO()
            fig.savefig(img_buffer, format='png', bbox_inches='tight')
            img_buffer.seek(0)
            logger.debug(f"Chart generated successfully for {ticker} on {date}")
            return send_file(img_buffer, mimetype='image/png', as_attachment=False)
        except Exception as e:
            logger.error(f"Chart generation failed: {str(e)}")
            return jsonify({'error': f'Chart generation error: {str(e)}'}), 500

    except Exception as e:
        logger.error(f"Error processing data for {ticker} on {date}: {str(e)}")
        return jsonify({'error': f'Error reading data: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)

    
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=False)