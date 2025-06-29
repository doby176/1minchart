document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, attaching event listener');
    const fetchDataButton = document.getElementById('fetchData');
    if (!fetchDataButton) {
        console.error('Button with ID "fetchData" not found');
        return;
    }

    const chartDiv = document.getElementById('stockChart');
    const panzoomElement = chartDiv.querySelector('.panzoom');
    const img = panzoomElement.querySelector('img');
    let panzoom;

    fetchDataButton.addEventListener('click', () => {
        console.log('Load Chart button clicked');

        fetchDataButton.disabled = true;
        fetchDataButton.textContent = 'Loading...';

        const ticker = document.getElementById('tickerSelect').value;
        const date = document.getElementById('dateInput').value;

        console.log('Fetching data for:', ticker, date);

        fetch(`/api/stock/chart?ticker=${ticker}&date=${date}`, { signal: AbortSignal.timeout(10000) }) // 10-second timeout
            .then(response => {
                console.log('Response status:', response.status);
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('No data available for this date');
                    } else if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || 30;
                        throw new Error(`You have reached the limit of attempts. Try again in ${retryAfter} minutes.`);
                    } else if (response.status === 502 || response.status === 504) {
                        throw new Error('Server temporarily unavailable. Please try again later.');
                    }
                    throw new Error(`Server error: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                img.src = url;

                if (panzoom) panzoom.destroy();

                img.onload = () => {
                    panzoom = Panzoom(panzoomElement, {
                        maxScale: 3,
                        minScale: 1,
                        step: 0.1,
                        contain: 'outside',
                        cursor: 'zoom-in'
                    });
                    console.log('Chart image loaded with Panzoom');
                };
            })
            .catch(error => {
                console.error('Error fetching chart:', error);
                if (error.name === 'TimeoutError') {
                    alert('Request timed out. Please try again later.');
                } else if (error.message.includes('No data available')) {
                    alert('Failed to load chart: No data for this date. Please choose another date (it may be a holiday or weekend).');
                } else if (error.message.includes('You have reached the limit')) {
                    alert(error.message);
                } else if (error.message.includes('Server temporarily unavailable')) {
                    alert(error.message);
                } else {
                    alert('Failed to load chart: ' + error.message + '. Please try again later or contact support.');
                }
            })
            .finally(() => {
                fetchDataButton.disabled = false;
                fetchDataButton.textContent = 'Load Chart';
            });
    });
});