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

        const ticker = document.getElementById('tickerSelect').value;
        const date = document.getElementById('dateInput').value;

        console.log('Fetching data for:', ticker, date);

        fetch(`/api/stock/chart?ticker=${ticker}&date=${date}`)
            .then(response => {
                console.log('Response status:', response.status);
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
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
                        maxScale: 3, // Limit max zoom to 3x
                        minScale: 1, // No zoom out below 1x
                        step: 0.1,   // Smoother zoom increments
                        contain: 'outside', // Keep image within bounds
                        cursor: 'zoom-in'
                    });
                    console.log('Chart image loaded with Panzoom');
                };
            })
            .catch(error => {
                console.error('Error fetching chart:', error);
                alert('Failed to load chart: ' + error.message);
            });
    });
});