import React from 'react';

const LockedCostumeNotice = () => {
    const containerStyle = {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 'calc(3 * 0.25rem)',
        justifyContent: 'center'
    };

    const svgStyle = {
        width: '50px',
        margin: '0 auto'
    };

    const paragraphStyle = {
        textAlign: 'center',
        verticalAlign: 'middle'
    };

    return (
        <div style={containerStyle}>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                style={svgStyle}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    // eslint-disable-next-line max-len
                    d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
                />
            </svg>
            <p style={paragraphStyle}>
                {'This costume is currently locked as another collaborator is editing it.'}
            </p>
        </div>
    );
};

export default LockedCostumeNotice;
