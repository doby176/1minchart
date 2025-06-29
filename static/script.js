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

        // Disable the button to prevent multiple clicks
        fetchDataButton.disabled = true;
        fetchDataButton.textContent = 'Loading...'; // Show loading state

        const ticker = document.getElementById('tickerSelect').value;
        const date = document.getElementById('dateInput').value;

        console.log('Fetching data for:', ticker, date);

        fetch(`/api/stock/chart?ticker=${ticker}&date=${date}`)
            .then(response => {
                console.log('Response status:', response.status);
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('No data available for this date');
                    } else if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || 30; // Default to 30 minutes
                        throw new Error(`You have reached the limit of attempts. Try again in ${retryAfter} minutes.`);
                    }
                    throw new Error(`HTTP error: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                img.src = url;

                // Destroy existing Panzoom instance if it exists
                if (panzoom) panzoom.destroy();

                // Initialize Panzoom after image loads
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
                if (error.message.includes('No data available')) {
                    alert('Failed to load chart: No data for this date. Please choose another date (it may be a holiday or weekend).');
                } else if (error.message.includes('You have reached the limit')) {
                    alert(error.message);
                } else {
                    alert('Failed to load chart: ' + error.message);
                }
            })
            .finally(() => {
                // Re-enable the button regardless of success or failure
                fetchDataButton.disabled = false;
                fetchDataButton.textContent = 'Load Chart';
            });
    });
});